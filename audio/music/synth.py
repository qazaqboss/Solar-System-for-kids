# Космический эмбиент: медленные пэды, суб-бас, колокольчики, мерцание, длинная реверберация.
# Бесшовная петля: хвост реверберации конца добавляется в начало.
import numpy as np, subprocess
SR = 44100
rng = np.random.default_rng(7)
BAR = 9.0                                  # длина аккорда, с
# прогрессия (MIDI): Dmaj9 → Bm9 → Gmaj7(#11) → Aadd9/E … и вторая половина с вариацией
CH = [[50, 57, 62, 64, 66, 69, 73], [47, 54, 59, 61, 62, 66, 69], [43, 50, 55, 59, 61, 66, 69], [45, 52, 57, 59, 61, 64, 71],
      [50, 57, 62, 66, 69, 71, 76], [52, 59, 62, 66, 67, 71, 74], [43, 50, 59, 62, 64, 66, 71], [45, 52, 57, 61, 64, 68, 73]]
N = len(CH); L = int(N * BAR * SR); TAIL = int(8 * SR)
out = np.zeros((L + TAIL, 2))
t_all = np.arange(L + TAIL) / SR
f = lambda m: 440 * 2 ** ((m - 69) / 12)

def env(n, att, rel, total):
    e = np.ones(n); a = int(att * SR); r = int(rel * SR)
    e[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    e[-r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return e

def pad_voice(freq, n, det):
    t = np.arange(n) / SR
    s = np.zeros(n)
    for d in (-det, 0, det):                     # три слегка расстроенных голоса
        ph = rng.random() * 6.28
        for h in range(1, 9):                    # мягкая «пила» без резких верхов
            s += np.sin(2 * np.pi * freq * (1 + d) * h * t + ph * h) / h ** 1.9
    return s / 3

# --- пэды
for k, chord in enumerate(CH):
    start = int(k * BAR * SR); n = int((BAR + 4.5) * SR)
    e = env(n, 3.2, 4.5, n)
    for j, m in enumerate(chord[1:]):
        v = pad_voice(f(m), n, 0.0035) * e * (0.055 if m < 60 else 0.045)
        pan = 0.5 + 0.35 * np.sin(j * 1.7 + k)
        seg = out[start:start + n]
        seg[:, 0] += v[:len(seg)] * np.sqrt(1 - pan); seg[:, 1] += v[:len(seg)] * np.sqrt(pan)
    # суб-бас на тонике аккорда
    t = np.arange(n) / SR
    b = np.sin(2 * np.pi * f(chord[0] - 12) * t) * 0.16 * env(n, 2.5, 4, n)
    seg = out[start:start + n]; seg += b[:len(seg), None] * 0.7

# --- колокольчики: редкие ноты из пентатоники аккорда, высоко
for k, chord in enumerate(CH):
    notes = sorted(set(m + 24 for m in chord[1:]))
    tt = k * BAR + 0.8
    while tt < (k + 1) * BAR - 0.5:
        m = notes[rng.integers(len(notes))]; fr = f(m)
        n = int(4.5 * SR); t = np.arange(n) / SR
        e = np.exp(-t * (1.6 + rng.random()))  * (1 - np.exp(-t * 300))
        v = (np.sin(2 * np.pi * fr * t) + 0.35 * np.sin(2 * np.pi * fr * 2.76 * t) * np.exp(-t * 3) + 0.15 * np.sin(2 * np.pi * fr * 5.4 * t) * np.exp(-t * 6)) * e * 0.05
        i0 = int(tt * SR); seg = out[i0:i0 + n]; pan = rng.random()
        seg[:, 0] += v[:len(seg)] * np.sqrt(1 - pan); seg[:, 1] += v[:len(seg)] * np.sqrt(pan)
        tt += rng.choice([0.75, 1.5, 1.5, 2.25, 3.0])

# --- мерцание: тихий отфильтрованный шум с медленным «дыханием»
noise = rng.standard_normal((L + TAIL, 2))
F = np.fft.rfft(noise, axis=0); fr = np.fft.rfftfreq(L + TAIL, 1 / SR)
F *= (np.exp(-((fr - 5200) / 2500) ** 2))[:, None]
air = np.fft.irfft(F, n=L + TAIL, axis=0)
air /= np.abs(air).max(); out += air * 0.012 * (0.6 + 0.4 * np.sin(2 * np.pi * t_all / (BAR * 2)))[:, None]

# --- реверберация (свёртка с синтетическим «залом» 6 с)
ir_n = int(6 * SR); ti = np.arange(ir_n) / SR
ir = rng.standard_normal((ir_n, 2)) * np.exp(-ti / 1.6)[:, None]
ir[:, 0] *= 1 - np.exp(-ti * 60); ir[:, 1] *= 1 - np.exp(-ti * 55)
Fi = np.fft.rfft(ir, n=len(out) + ir_n, axis=0); ir = np.fft.irfft(Fi * np.exp(-((np.fft.rfftfreq(len(out) + ir_n, 1 / SR)) / 7000) ** 2)[:, None], axis=0)[:ir_n]
wet = np.zeros((len(out) + ir_n, 2))
for c in range(2):
    m = len(out) + ir_n
    wet[:, c] = np.fft.irfft(np.fft.rfft(out[:, c], m) * np.fft.rfft(ir[:, c], m), m)
wet = wet / np.abs(wet).max() * np.abs(out).max() * 1.1
mix = np.zeros_like(wet); mix[:len(out)] += out * 0.55; mix += wet * 0.6
# бесшовная петля: всё, что после конца, складываем в начало
loop = mix[:L].copy(); rest = mix[L:]; loop[:len(rest)] += rest[:L]
loop = np.tanh(loop / np.abs(loop).max() * 1.2) * 0.85
pcm = (loop * 32767).astype(np.int16)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "loudnorm=I=-22:TP=-2:LRA=11", "-ar", "44100", "-b:a", "112k", "space.mp3"], input=pcm.tobytes(), check=True)
print("ok", L / SR, "s")
