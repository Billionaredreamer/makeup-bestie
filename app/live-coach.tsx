"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LiveCoachContext = {
  lookTitle: string;
  feature: string;
  product: string;
  instruction: string;
  adaptation: string;
  checkpoint: string;
  faceShape: string;
  skinType: string;
  skinTone: string;
  experience: string;
};

type CoachStatus = "off" | "requesting" | "connecting" | "listening" | "speaking" | "paused" | "error";

const statusCopy: Record<CoachStatus, string> = {
  off: "Optional voice guidance",
  requesting: "Requesting microphone…",
  connecting: "Connecting securely…",
  listening: "Listening",
  speaking: "Bestie is speaking",
  paused: "Coach paused",
  error: "Coach unavailable",
};

export function LiveCoach({ context }: { context: LiveCoachContext }) {
  const [status, setStatus] = useState<CoachStatus>("off");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef(context);
  const statusRef = useRef<CoachStatus>("off");
  const startingRef = useRef(false);

  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { statusRef.current = status; }, [status]);

  const send = useCallback((event: object) => {
    if (channelRef.current?.readyState === "open") channelRef.current.send(JSON.stringify(event));
  }, []);

  useEffect(() => {
    if (channelRef.current?.readyState !== "open") return;
    send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: `[App context update — do not answer until the user speaks.] Current feature: ${context.feature}. Current product: ${context.product}. Instruction: ${context.instruction}. Face-specific adaptation: ${context.adaptation}. Ready checkpoint: ${context.checkpoint}.` }],
      },
    });
  }, [context, send]);

  const stop = useCallback(() => {
    startingRef.current = false;
    statusRef.current = "off";
    channelRef.current?.close();
    peerRef.current?.close();
    microphoneRef.current?.getTracks().forEach(track => track.stop());
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    channelRef.current = null;
    peerRef.current = null;
    microphoneRef.current = null;
    setMuted(false);
    setError("");
    setStatus("off");
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    if (startingRef.current || statusRef.current !== "off" && statusRef.current !== "error") return;
    stop();
    startingRef.current = true;
    setError("");
    setStatus("requesting");
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (!startingRef.current) { microphone.getTracks().forEach(track => track.stop()); return; }
      microphoneRef.current = microphone;
      setStatus("connecting");
      const tokenResponse = await fetch("/api/realtime-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contextRef.current),
      });
      const tokenText = await tokenResponse.text();
      let tokenData: { value?: string; error?: string } = {};
      try { tokenData = tokenText ? JSON.parse(tokenText) as typeof tokenData : {}; } catch { /* handled below */ }
      if (!tokenResponse.ok || !tokenData.value) throw new Error(tokenData.error || "The secure voice session could not be created.");

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      microphone.getTracks().forEach(track => peer.addTrack(track, microphone));
      peer.ontrack = event => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => setError("Tap the coach once more to allow audio playback."));
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(peer.connectionState) && statusRef.current !== "off") {
          setStatus("error");
          setError("The live coach connection ended. You can reconnect without restarting the camera.");
        }
      };
      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => {
        startingRef.current = false;
        setStatus("listening");
        send({ type: "response.create", response: { instructions: `Greet the user as their Makeup Bestie in one short sentence, then explain the current ${contextRef.current.product} step in no more than two short sentences.` } });
      };
      channel.onmessage = event => {
        try {
          const message = JSON.parse(event.data) as { type?: string; error?: { message?: string } };
          if (message.type === "input_audio_buffer.speech_started") setStatus("listening");
          if (message.type === "response.output_audio.delta" || message.type === "response.audio.delta") setStatus("speaking");
          if (message.type === "response.done") setStatus("listening");
          if (message.type === "error") { setStatus("error"); setError(message.error?.message || "The coach hit an unexpected error."); }
        } catch { /* Ignore non-JSON transport events. */ }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answerResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${tokenData.value}`, "Content-Type": "application/sdp" },
      });
      if (!answerResponse.ok) throw new Error(answerResponse.status === 429 ? "The live coach usage limit has been reached." : "The secure voice connection could not be completed.");
      await peer.setRemoteDescription({ type: "answer", sdp: await answerResponse.text() });
    } catch (reason) {
      startingRef.current = false;
      statusRef.current = "error";
      channelRef.current?.close();
      peerRef.current?.close();
      microphoneRef.current?.getTracks().forEach(track => track.stop());
      channelRef.current = null;
      peerRef.current = null;
      microphoneRef.current = null;
      const denied = reason instanceof DOMException && (reason.name === "NotAllowedError" || reason.name === "PermissionDeniedError");
      setError(denied ? "Microphone permission was denied. The visual lesson still works without voice." : reason instanceof Error ? reason.message : "The live coach could not start.");
      setStatus("error");
    }
  };

  const toggleMute = () => {
    const next = !muted;
    microphoneRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  };
  const togglePause = () => {
    if (status === "paused") {
      microphoneRef.current?.getAudioTracks().forEach(track => { track.enabled = !muted; });
      setStatus("listening");
      return;
    }
    send({ type: "response.cancel" });
    microphoneRef.current?.getAudioTracks().forEach(track => { track.enabled = false; });
    setStatus("paused");
  };
  const repeat = () => send({ type: "response.create", response: { instructions: `Repeat the current ${contextRef.current.product} instruction and its face-specific placement in two concise, encouraging sentences.` } });
  const active = !["off", "error"].includes(status);

  return <div className={`live-coach-dock ${active ? "active" : ""} status-${status}`}>
    <audio ref={audioRef} autoPlay aria-hidden="true"/>
    <button className="coach-dot" aria-label={!active?"Start live coach":status==="paused"?"Resume coach":"Pause coach"} aria-busy={status==="requesting"||status==="connecting"} onClick={()=>{if(active)togglePause();else void start();}}/>
    <span className="sr-only" role="status">{statusCopy[status]}</span>
    {active&&<><p className="coach-hint">Ask anything about this step</p><div className="coach-controls"><button aria-pressed={muted} onClick={toggleMute}>{muted?"Unmute":"Mute"}</button><button className="coach-end" onClick={stop}>End</button><button className="sr-only" onClick={repeat}>Repeat instruction</button></div></>}
    {error&&<p className="coach-error" role="alert">{error}</p>}
  </div>;
}
