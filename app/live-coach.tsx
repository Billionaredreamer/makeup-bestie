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
type EndReason = "user" | "limit" | "inactive" | "connection" | "error" | "unmount";
type UsageTotals = { inputTokens: number; outputTokens: number; inputAudioTokens: number; outputAudioTokens: number; cachedInputTokens: number };

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
  const [notice, setNotice] = useState("");
  const [muted, setMuted] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef(context);
  const statusRef = useRef<CoachStatus>("off");
  const startingRef = useRef(false);
  const sessionIdRef = useRef("");
  const sessionStartedAtRef = useRef(0);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivitySecondsRef = useRef(90);
  const usageRef = useRef<UsageTotals>({ inputTokens: 0, outputTokens: 0, inputAudioTokens: 0, outputAudioTokens: 0, cachedInputTokens: 0 });

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

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    warningTimerRef.current = null;
    limitTimerRef.current = null;
    inactivityTimerRef.current = null;
  }, []);

  const finishSession = useCallback((reason: EndReason) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    sessionIdRef.current = "";
    const durationSeconds = sessionStartedAtRef.current ? Math.round((Date.now() - sessionStartedAtRef.current) / 1000) : 0;
    void fetch("/api/realtime-session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, reason, durationSeconds, ...usageRef.current }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const stop = useCallback((reason: EndReason = "user", message = "") => {
    startingRef.current = false;
    statusRef.current = "off";
    clearTimers();
    finishSession(reason);
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
    setNotice(message);
    setStatus("off");
  }, [clearTimers, finishSession]);

  useEffect(() => () => stop("unmount"), [stop]);

  const resetInactivityTimer = useCallback(() => {
    if (!sessionIdRef.current) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      stop("inactive", "Live Coach ended after 90 seconds without activity. Tap whenever you want to start a new session.");
    }, inactivitySecondsRef.current * 1000);
  }, [stop]);

  const start = async () => {
    if (startingRef.current || statusRef.current !== "off" && statusRef.current !== "error") return;
    stop("user");
    startingRef.current = true;
    setError("");
    setNotice("");
    usageRef.current = { inputTokens: 0, outputTokens: 0, inputAudioTokens: 0, outputAudioTokens: 0, cachedInputTokens: 0 };
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
      let tokenData: { value?: string; error?: string; sessionId?: string; sessionLimitSeconds?: number; warningAtSeconds?: number; inactivitySeconds?: number } = {};
      try { tokenData = tokenText ? JSON.parse(tokenText) as typeof tokenData : {}; } catch { /* handled below */ }
      if (!tokenResponse.ok || !tokenData.value) throw new Error(tokenData.error || "The secure voice session could not be created.");
      sessionIdRef.current = tokenData.sessionId || "";
      inactivitySecondsRef.current = tokenData.inactivitySeconds || 90;

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
          stop("connection");
          statusRef.current = "error";
          setStatus("error");
          setError("The live coach connection ended. You can reconnect without restarting the camera.");
        }
      };
      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => {
        startingRef.current = false;
        sessionStartedAtRef.current = Date.now();
        setStatus("listening");
        const warningAt = tokenData.warningAtSeconds || 8 * 60;
        const limitAt = tokenData.sessionLimitSeconds || 11 * 60;
        warningTimerRef.current = setTimeout(() => setNotice("3 minutes left in this Live Coach session."), warningAt * 1000);
        limitTimerRef.current = setTimeout(() => stop("limit", "Your 11-minute Live Coach session ended. You can start another whenever you’re ready."), limitAt * 1000);
        resetInactivityTimer();
        send({ type: "response.create", response: { instructions: `Greet the user as their Makeup Bestie in one short sentence, then explain the current ${contextRef.current.product} step in no more than two short sentences.` } });
      };
      channel.onmessage = event => {
        try {
          const message = JSON.parse(event.data) as { type?: string; error?: { message?: string }; response?: { usage?: { input_tokens?: number; output_tokens?: number; input_token_details?: { audio_tokens?: number; cached_tokens?: number }; output_token_details?: { audio_tokens?: number } } } };
          if (message.type === "input_audio_buffer.speech_started") { setStatus("listening"); resetInactivityTimer(); }
          if (message.type === "response.output_audio.delta" || message.type === "response.audio.delta") { setStatus("speaking"); resetInactivityTimer(); }
          if (message.type === "response.done") {
            setStatus("listening");
            resetInactivityTimer();
            const usage = message.response?.usage;
            if (usage) usageRef.current = {
              inputTokens: usageRef.current.inputTokens + (usage.input_tokens || 0),
              outputTokens: usageRef.current.outputTokens + (usage.output_tokens || 0),
              inputAudioTokens: usageRef.current.inputAudioTokens + (usage.input_token_details?.audio_tokens || 0),
              outputAudioTokens: usageRef.current.outputAudioTokens + (usage.output_token_details?.audio_tokens || 0),
              cachedInputTokens: usageRef.current.cachedInputTokens + (usage.input_token_details?.cached_tokens || 0),
            };
          }
          if (message.type === "error") {
            stop("error");
            statusRef.current = "error";
            setStatus("error");
            setError(message.error?.message || "The coach hit an unexpected error.");
          }
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
      clearTimers();
      finishSession("error");
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
    resetInactivityTimer();
  };
  const togglePause = () => {
    if (status === "paused") {
      microphoneRef.current?.getAudioTracks().forEach(track => { track.enabled = !muted; });
      setStatus("listening");
      resetInactivityTimer();
      return;
    }
    send({ type: "response.cancel" });
    microphoneRef.current?.getAudioTracks().forEach(track => { track.enabled = false; });
    setStatus("paused");
  };
  const repeat = () => { resetInactivityTimer(); send({ type: "response.create", response: { instructions: `Repeat the current ${contextRef.current.product} instruction and its face-specific placement in two concise, encouraging sentences.` } }); };
  const active = !["off", "error"].includes(status);

  return <div className={`live-coach-dock ${active ? "active" : ""} status-${status}`}>
    <audio ref={audioRef} autoPlay aria-hidden="true"/>
    <button className="coach-dot" aria-label={!active?"Start live coach":status==="paused"?"Resume coach":"Pause coach"} aria-busy={status==="requesting"||status==="connecting"} onClick={()=>{if(active)togglePause();else void start();}}>
      <span aria-hidden="true">♪</span>
      <b>Live coach</b>
      <small>{status==="off"||status==="error"?"Tap for live guidance":statusCopy[status]}</small>
    </button>
    <span className="sr-only" role="status">{statusCopy[status]}</span>
    {active&&<><p className="coach-hint">Ask anything about this step</p><div className="coach-controls"><button aria-pressed={muted} onClick={toggleMute}>{muted?"Unmute":"Mute"}</button><button className="coach-end" onClick={()=>stop("user")}>End</button><button className="sr-only" onClick={repeat}>Repeat instruction</button></div></>}
    {notice&&<p className="coach-error" role="status">{notice}</p>}
    {error&&<p className="coach-error" role="alert">{error}</p>}
  </div>;
}
