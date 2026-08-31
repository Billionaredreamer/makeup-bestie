import test from "node:test";
import assert from "node:assert/strict";
import { buildPlacement, faceAnchors, smooth, band, oval, arrow } from "../lib/placement-map.ts";
import { makeFaceLandmarks, FIXTURE_ASPECT } from "./face-fixture.mjs";

const points = makeFaceLandmarks();
const anchors = faceAnchors(points, FIXTURE_ASPECT);
const plan = (areas, technique, shape = "oval") => buildPlacement(points, areas, technique, shape, FIXTURE_ASPECT);

/** Every number that appears in an SVG path, so paths can be range-checked. */
const numbersIn = path => (path.match(/-?\d+(\.\d+)?/g) || []).map(Number);

test("path helpers emit valid, finite SVG geometry", () => {
  const line = [{ x: .2, y: .2 }, { x: .4, y: .3 }, { x: .6, y: .25 }];
  for (const path of [smooth(line, true), smooth(line, false), band(line, [.02, .03, .02]), oval({ x: .5, y: .5 }, .1, .05, .4), arrow(line[0], line[2])]) {
    assert.match(path, /^M /, "every path starts with a move");
    assert.ok(numbersIn(path).every(Number.isFinite), "no NaN leaks into path data");
  }
  assert.match(smooth(line, true), /Z$/, "closed outlines are closed");
  assert.equal(smooth([{ x: .1, y: .1 }], true), "", "a single point cannot form a shape");
});

test("anchors come from real landmarks when a scan is available", () => {
  assert.equal(anchors.mapped, true);
  assert.equal(faceAnchors([], FIXTURE_ASPECT).mapped, false, "a missing scan falls back to a generic face");
  // Display space: x is scaled by the photo aspect so shapes are not stretched.
  assert.ok(Math.abs(anchors.centerX - FIXTURE_ASPECT / 2) < 0.02, "the face is centred in display space");
  assert.ok(anchors.edgeL.x < anchors.centerX && anchors.edgeR.x > anchors.centerX);
  assert.ok(anchors.top.y < anchors.chin.y);
});

test("every zone stays on the face and carries a direction arrow", () => {
  const cases = [
    [["all-face"], "base"], [["complexion"], "conceal"], [["forehead"], "contour"],
    [["both-cheeks"], "blush"], [["both-cheeks"], "contour"], [["both-cheeks"], "highlight"],
    [["both-eyes"], "eyes"], [["both-eyes"], "eyeliner"], [["brows"], "brow"],
    [["nose"], "contour"], [["nose"], "highlight"], [["lips"], "lips"], [["jaw"], "contour"],
  ];
  for (const [areas, technique] of cases) {
    const zones = plan(areas, technique);
    assert.ok(zones.length > 0, `${technique} on ${areas} produces zones`);
    for (const zone of zones) {
      assert.match(zone.outline, /^M /, `${zone.id} has an outline`);
      assert.ok(zone.arrows.length > 0, `${zone.id} shows which way to blend`);
      assert.ok(zone.label.length > 0, `${zone.id} is labelled`);
      const values = [...numbersIn(zone.outline), ...zone.arrows.flatMap(numbersIn)];
      assert.ok(values.every(Number.isFinite), `${zone.id} has finite coordinates`);
      // Generous bounds: shapes may sit slightly proud of the face, never off-photo.
      assert.ok(Math.min(...values) > -0.2, `${zone.id} stays on the photo`);
      assert.ok(Math.max(...values) < Math.max(FIXTURE_ASPECT, 1) + 0.2, `${zone.id} stays on the photo`);
      assert.ok(zone.anchor.y > anchors.top.y - 0.1 && zone.anchor.y < anchors.chin.y + 0.1, `${zone.id} labels within the face`);
    }
  }
});

test("paired features land on opposite sides of the face", () => {
  for (const [areas, technique] of [[["both-cheeks"], "blush"], [["both-eyes"], "eyes"], [["brows"], "brow"], [["jaw"], "contour"]]) {
    const zones = plan(areas, technique);
    assert.equal(zones.length >= 2, true, `${technique} marks both sides`);
    assert.ok(zones.some(zone => zone.anchor.x < anchors.centerX), `${technique} marks the image-left side`);
    assert.ok(zones.some(zone => zone.anchor.x > anchors.centerX), `${technique} marks the image-right side`);
  }
});

test("a single-side area marks only that side, on the user's own left", () => {
  const left = plan(["left-cheek"], "blush");
  const right = plan(["right-cheek"], "blush");
  assert.equal(left.length, 1);
  assert.equal(right.length, 1);
  // The user's left cheek appears on the right of an unmirrored photo.
  assert.ok(left[0].anchor.x > anchors.centerX, "the user's left cheek is image-right");
  assert.ok(right[0].anchor.x < anchors.centerX, "the user's right cheek is image-left");
  assert.match(left[0].label, /^Left/);
  assert.match(right[0].label, /^Right/);
});

test("contour sits under the cheekbone and never crosses the pupil line", () => {
  const [imageLeft] = plan(["right-cheek"], "contour");
  const apple = anchors.eyeCenterL;
  const innermost = Math.max(...numbersIn(imageLeft.outline).filter((_, index) => index % 2 === 0));
  assert.ok(innermost < apple.x + 0.04, "contour stops around the pupil line, not beside the nose");
  assert.ok(imageLeft.anchor.y > anchors.eyeCenterL.y, "contour sits below the eye, under the cheekbone");
  assert.ok(imageLeft.anchor.y < anchors.chin.y, "contour stays above the chin");
});

test("blush sits on the apple of the cheek, below the eye and above the mouth", () => {
  const [imageLeft] = plan(["right-cheek"], "blush");
  assert.ok(imageLeft.anchor.y > anchors.eyeCenterL.y, "below the eye");
  assert.ok(imageLeft.anchor.y < anchors.mouthL.y, "above the mouth corner");
});

test("the concealer triangle hangs below the eye it belongs to", () => {
  const zones = plan(["complexion"], "conceal");
  assert.equal(zones.length, 2, "one triangle per eye");
  for (const zone of zones) {
    const eye = zone.anchor.x < anchors.centerX ? anchors.eyeCenterL : anchors.eyeCenterR;
    assert.ok(zone.anchor.y > eye.y, `${zone.id} sits under the eye`);
    assert.ok(zone.anchor.y < anchors.noseBottom.y + 0.06, `${zone.id} stops at mid-cheek`);
    assert.match(zone.label, /under-eye/);
  }
});

test("lips are traced from the real lip landmarks", () => {
  const [lips] = plan(["lips"], "lips");
  const values = numbersIn(lips.outline);
  const xs = values.filter((_, index) => index % 2 === 0);
  const ys = values.filter((_, index) => index % 2 === 1);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.12, "the lip outline is lip-sized, not face-sized");
  assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - anchors.centerX) < 0.03, "centred on the mouth");
  assert.equal(lips.arrows.length, 2, "colour is worked in from both corners");
});

test("face shape changes where blush actually goes", () => {
  const [round] = buildPlacement(points, ["right-cheek"], "blush", "round", FIXTURE_ASPECT);
  const [oblong] = buildPlacement(points, ["right-cheek"], "blush", "oblong", FIXTURE_ASPECT);
  // A round face lifts colour toward the temple; a long face keeps it horizontal.
  assert.ok(round.anchor.y < oblong.anchor.y, "round faces get a higher, lifted sweep");
  assert.notEqual(round.outline, oblong.outline);
});

test("long faces get hairline shading added to a contour step", () => {
  const oblong = buildPlacement(points, ["both-cheeks"], "contour", "oblong", FIXTURE_ASPECT);
  const oval = buildPlacement(points, ["both-cheeks"], "contour", "oval", FIXTURE_ASPECT);
  assert.ok(oblong.some(zone => zone.id === "contour-forehead"), "a long face is shortened at the hairline");
  assert.ok(!oval.some(zone => zone.id === "contour-forehead"));
});

test("a focused feature chart never adds a different facial area", () => {
  const cheekOnly = buildPlacement(points, ["both-cheeks"], "contour", "oblong", FIXTURE_ASPECT, false);
  assert.ok(cheekOnly.every(zone => zone.id.includes("cheek")), "part-by-part cheek mode stays on the cheeks");
  const jawOnly = buildPlacement(points, ["jaw"], "contour", "oblong", FIXTURE_ASPECT, false);
  assert.ok(jawOnly.every(zone => zone.id.includes("jaw")), "part-by-part jaw mode stays on the jaw");
});

test("overlapping areas in one step never draw the same shape twice", () => {
  const zones = plan(["complexion", "both-cheeks", "forehead", "nose", "jaw"], "base");
  const ids = zones.map(zone => zone.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate zone ids");
  assert.equal(zones.length, 1, "a whole-complexion step is drawn once, not once per area");
});

test("a lesson still charts when the scan failed", () => {
  const zones = buildPlacement([], ["both-cheeks"], "blush", null, FIXTURE_ASPECT);
  assert.equal(zones.length, 2);
  assert.ok(zones.every(zone => numbersIn(zone.outline).every(Number.isFinite)));
});

test("an empty or unusable step charts nothing rather than guessing", () => {
  assert.deepEqual(plan(["none"], "finish"), []);
  assert.deepEqual(plan([], "base"), []);
});
