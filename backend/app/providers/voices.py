"""Voice grouping: which transcript segments sound like the same person.

A HINT for the clinician, never a role (Blueprint §7.2: roles are never forced). Segments are grouped
by pitch and spectral shape with a small two-cluster k-means; the first voice heard is voice 1. If the
two voices are not clearly different (for example two people of similar pitch), or a segment is too
short or unvoiced, it is left unlabelled and the clinician sets roles by hand. A proper speaker-
identification model is a planned improvement; this is deliberately simple and says so when unsure.
"""

from typing import Optional

import numpy as np

SR = 16_000
FRAME = int(0.03 * SR)
HOP = int(0.01 * SR)
F_MIN, F_MAX = 70.0, 400.0
MIN_VOICED_FRAMES = 8
MIN_SEPARATION = 2.0  # distance between voices, in units of pooled spread, to trust the grouping
MIN_PITCH_GAP = 0.2  # and the voices must differ in pitch by at least ~22% (log scale)


def _frame_features(frame: np.ndarray) -> Optional[tuple[float, float]]:
    """(f0 in Hz, spectral centroid in Hz) for a voiced frame, else None."""
    frame = frame - frame.mean()
    energy = float(np.dot(frame, frame))
    if energy < 1e-4 * len(frame):
        return None
    windowed = frame * np.hanning(len(frame))
    ac = np.correlate(windowed, windowed, mode="full")[len(frame) - 1 :]
    if ac[0] <= 0:
        return None
    lo, hi = int(SR / F_MAX), int(SR / F_MIN)
    seg = ac[lo:hi]
    if len(seg) == 0:
        return None
    lag = int(np.argmax(seg)) + lo
    if ac[lag] / ac[0] < 0.4:  # not clearly periodic: unvoiced or noise
        return None
    spec = np.abs(np.fft.rfft(windowed))
    freqs = np.fft.rfftfreq(len(frame), 1 / SR)
    centroid = float((freqs * spec).sum() / (spec.sum() + 1e-9))
    return SR / lag, centroid


def _segment_vector(samples: np.ndarray) -> Optional[np.ndarray]:
    feats = []
    for start in range(0, len(samples) - FRAME, HOP):
        f = _frame_features(samples[start : start + FRAME])
        if f is not None:
            feats.append(f)
    if len(feats) < MIN_VOICED_FRAMES:
        return None
    arr = np.array(feats)
    return np.array([np.log(np.median(arr[:, 0])), np.log(np.median(arr[:, 1]))])


def _kmeans2(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    centers = np.stack([x[np.argmin(x[:, 0])], x[np.argmax(x[:, 0])]])
    labels = np.zeros(len(x), dtype=int)
    for _ in range(20):
        d = np.linalg.norm(x[:, None, :] - centers[None, :, :], axis=2)
        new = d.argmin(axis=1)
        if np.array_equal(new, labels) and _ > 0:
            break
        labels = new
        for k in (0, 1):
            if (labels == k).any():
                centers[k] = x[labels == k].mean(axis=0)
    return labels, centers


def assign_voices(audio: np.ndarray, spans: list[tuple[float, float]]) -> list[Optional[int]]:
    """Voice number (1, 2) for each (start, end) span in seconds, or None when unsure."""
    if not spans or len(audio) == 0:
        return [None] * len(spans)
    vectors: list[Optional[np.ndarray]] = []
    for s, e in spans:
        chunk = audio[int(s * SR) : int(e * SR)]
        vectors.append(_segment_vector(chunk) if len(chunk) >= FRAME * 4 else None)
    have = [i for i, v in enumerate(vectors) if v is not None]
    if len(have) < 2:
        return [None] * len(spans)
    x = np.stack([vectors[i] for i in have])
    labels, centers = _kmeans2(x)
    if len(set(labels.tolist())) < 2:
        return [None] * len(spans)
    spread = np.sqrt(np.mean([x[labels == k].var(axis=0).sum() for k in (0, 1)])) + 1e-3
    separation = float(np.linalg.norm(centers[0] - centers[1]) / spread)
    if separation < MIN_SEPARATION or abs(centers[0][0] - centers[1][0]) < MIN_PITCH_GAP:
        return [None] * len(spans)
    # number voices by first appearance
    first = {}
    for pos, lab in zip(have, labels.tolist()):
        first.setdefault(lab, pos)
    order = {lab: n + 1 for n, lab in enumerate(sorted(first, key=first.get))}
    out: list[Optional[int]] = [None] * len(spans)
    for pos, lab in zip(have, labels.tolist()):
        out[pos] = order[lab]
    return out
