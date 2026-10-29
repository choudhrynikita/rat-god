#!/usr/bin/env python3
"""Original calming synthwave beds for Rat God. Not a recording or a cover.
Four seamless loops: drift (day), night, strain, hymn.
"""
import json
import os
import subprocess
import numpy as np

SR = 44100
BPM = 74
BARS = 8
BEAT = 60 / BPM
DUR = BARS * 4 * BEAT
N = int(SR * DUR)
XF = int(0.35 * SR)
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'final', 'audio')

def tone(freq, n, sr, partials=8, det=0.004):
    t = np.arange(n, dtype=np.float64) / sr
    y = np.zeros(n, dtype=np.float64)
    for sign, w in ((-1, 0.45), (0, 0.7), (1, 0.45)):
        f = freq * (1 + sign * det)
        ph = 2 * np.pi * f * t
        for h in range(1, partials + 1):
            y += np.sin(ph * h) * (w / h)
    return y

def oneshot(n, sr, decay, freq):
    t = np.arange(n, dtype=np.float64) / sr
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * decay)

def bed(chords, arp_mode, pulse, air, brightness):
    extra = N + XF
    y = np.zeros(extra, dtype=np.float64)
    bar = int(SR * BEAT * 4)
    for i, notes in enumerate(chords):
        a = i * bar * 2
        b = min(extra, a + bar * 2 + int(0.08 * SR))
        if a >= extra:
            break
        seg = b - a
        layer = np.zeros(seg)
        for f in notes:
            layer += tone(f, seg, SR, partials=7 if brightness < 0.5 else 10, det=0.0035)
        # soft attack so a chord change does not click
        att = int(0.09 * SR)
        env = np.ones(seg)
        env[:att] = np.linspace(0, 1, att)
        rel = int(0.12 * SR)
        if rel < seg:
            env[-rel:] *= np.linspace(1, 0, rel)
        y[a:b] += layer * env * 0.22
    # gentle pulse: a rounded kick on 1 and 3, no hats, no noise bursts
    if pulse > 0:
        kick = oneshot(int(0.22 * SR), SR, 14, 48) + 0.35 * oneshot(int(0.22 * SR), SR, 22, 90)
        step = int(SR * BEAT)
        side = np.zeros(extra)
        for beat in range(int(extra / step) + 1):
            if beat % 2:
                continue
            s = beat * step
            e = min(extra, s + len(kick))
            y[s:e] += kick[: e - s] * (0.16 * pulse)
            side[s:e] = np.maximum(side[s:e], np.linspace(1, 0, e - s) ** 1.6)
        y *= 1 - 0.28 * pulse * side
    # arp: original pattern, root / fifth / third, very quiet
    if arp_mode:
        step = int(SR * BEAT / (2 if arp_mode == 'day' else 1))
        for i in range(int(extra / step)):
            chord = chords[min(len(chords) - 1, (i * step) // (bar * 2))]
            idx = (0, 2, 1, 2)[i % 4] if arp_mode == 'day' else (0, 2)[i % 2]
            f = chord[min(idx, len(chord) - 1)] * 2
            nlen = int(step * 0.85)
            s = i * step
            e = min(extra, s + nlen)
            blip = tone(f, e - s, SR, partials=2, det=0.001)
            att = max(1, int(0.02 * SR))
            blip[:att] *= np.linspace(0, 1, att)
            blip *= np.linspace(1, 0.15, e - s)
            y[s:e] += blip * (0.045 if arp_mode == 'day' else 0.03)
    if air > 0:
        rng = np.random.default_rng(7)
        noise = rng.standard_normal(extra)
        noise = np.convolve(noise, np.ones(64) / 64, mode='same')
        y += noise * air * 0.015
    # two slow swells that meet themselves at the loop
    t = np.arange(extra) / SR
    y *= 0.82 + 0.18 * np.cos(2 * np.pi * t / DUR)
    # seam
    fade = np.linspace(0, 1, XF)
    loop = y[:N].copy()
    loop[:XF] = y[:XF] * (1 - fade) + y[N:N + XF] * fade
    # stereo: a few milliseconds of width, not a hard pan
    delay = int(0.012 * SR)
    left = loop
    right = np.concatenate([loop[delay:], loop[:delay]])
    stereo = np.stack([left, 0.92 * right], axis=1)
    peak = np.max(np.abs(stereo)) or 1
    stereo *= 0.42 / peak
    return stereo.astype(np.float32)

def write(name, audio):
    wav = os.path.join(OUT, name + '.wav')
    ogg = os.path.join(OUT, name + '.ogg')
    m4a = os.path.join(OUT, name + '.m4a')
    import wave
    pcm = np.clip(audio, -1, 1)
    ints = (pcm * 32767).astype(np.int16)
    with wave.open(wav, 'w') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(ints.tobytes())
    subprocess.check_call(['ffmpeg', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '5', ogg], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.check_call(['ffmpeg', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', m4a], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.remove(wav)
    return os.path.getsize(ogg), os.path.getsize(m4a)

def cue(cid, ogg, m4a):
    return {
        'id': cid, 'kind': 'loop', 'file': cid, 'dur': round(DUR, 4),
        'bpm': BPM, 'beatsPerBar': 4, 'bars': BARS,
        'loop': True, 'loopStart': 0, 'loopEnd': round(DUR, 4),
        'lufs': -16, 'gainDb': 0, 'tags': ['synthwave', 'original'],
        'bytes': {'ogg': ogg, 'm4a': m4a}, 'model': 'original-numpy-bed', 'source': 'scripts/synthwave_beds.py',
    }

def main():
    os.makedirs(OUT, exist_ok=True)
    # i – VI – III – VII in A minor. Original arrangement, no borrowed melody.
    A = [220.00, 261.63, 329.63]
    F = [174.61, 220.00, 261.63]
    C = [130.81, 164.81, 196.00]
    G = [196.00, 246.94, 293.66]
    Bb = [233.08, 293.66, 349.23]
    Dm = [146.83, 174.61, 220.00]
    E = [164.81, 207.65, 246.94]
    beds = {
        'bed_drift': bed([A, F, C, G], 'day', 0.55, 0.4, 0.7),
        'bed_night': bed([A, F, C, G], 'night', 0.2, 0.25, 0.35),
        'bed_strain': bed([A, Bb, Dm, E], 'night', 0.7, 0.15, 0.4),
        'bed_hymn': bed([C, A, F, G], 'day', 0.15, 0.5, 0.9),
    }
    cues = {}
    for name, audio in beds.items():
        ogg, m4a = write(name, audio)
        cues[name] = cue(name, ogg, m4a)
        print(name, ogg, m4a, 'sec', round(DUR, 2))
    manifest = {'version': 3, 'bpmGrid': BPM, 'key': 'A minor', 'cues': cues, 'sfx': {'procedural': [], 'sampled': []}}
    with open(os.path.join(OUT, 'audio_manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')

if __name__ == '__main__':
    main()
