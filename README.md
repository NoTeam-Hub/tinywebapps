# Tiny Web Apps

**Free, private tools that run in your browser. No sign-up, no uploads, no price tag.**

Live at **https://tinywebapps.in**

Tiny Web Apps is one small website that hosts six tools, plus a hub page that links them together. Every tool does its work on the visitor's own device, so photos, recordings, videos and resumes are never sent to a server.

| Tool | Address | What it does |
|---|---|---|
| **Upright** | [/upright/](https://tinywebapps.in/upright/) | A vertical video editor for Reels, Shorts and TikTok. Drop clips and photos, trim and split, add text, emoji and captions, add music with beat sync, and export MP4 or WebM. |
| **Clearcut** | [/clearcut/](https://tinywebapps.in/clearcut/) | Removes the background from a photo and exports a transparent PNG. A precision brush lets you refine the edges. |
| **Verbatim** | [/verbatim/](https://tinywebapps.in/verbatim/) | Turns speech into text. Add an audio or video file, or record with the microphone, and copy the transcript. |
| **Stillreel** | [/stillreel/](https://tinywebapps.in/stillreel/) | Builds a video from photos and words: text scenes, a 3D depth effect on photos, music, and export to MP4 or WebM. |
| **The Tailorly** | [/tailorly/](https://tinywebapps.in/tailorly/) | Tailors a resume to a job post. Shows a match score, the missing keywords and stronger bullet points beside your text. |
| **Polish** | [/enhance/](https://tinywebapps.in/enhance/) | Drop a photo and it is enhanced automatically: light, colour, noise and detail are fixed with no prompts. Then pick one of 12 filters, compare before and after, and download as JPG or PNG. |

## How each tool works

**Upright.** No model files. It is built on standard browser features: Canvas draws each frame, Web Audio mixes clip audio and music and finds beats, and MediaRecorder records the result to MP4 (where the browser supports it) or WebM. Export runs in real time, so a 30-second reel takes 30 seconds and the tab must stay open.

**Clearcut.** A segmentation model (IS-Net, from the DIS project) runs in the browser through WebAssembly. The model is about 47 MB. It loads when the page opens and the browser keeps it afterwards.

**Verbatim.** OpenAI's Whisper (Tiny or Base) runs in the browser through WebAssembly. Base is about 80 MB and Tiny about 45 MB. The model is downloaded once and then cached. Accuracy is best on clear speech in widely spoken languages, and weaker on noisy audio, names and less common languages.

**Stillreel.** A depth model (MiDaS, about 34 MB) gives photos a 3D camera move. If the model cannot load, the editor still works with a flat camera move. Exporting needs a browser with WebCodecs: Chrome, Edge, Safari 16.4 or newer, or Firefox 130 or newer on a computer.

**The Tailorly.** Matching, scoring and rewriting use plain text analysis written for this site. There are no model files. Resumes can be pasted or dropped in as PDF, Word (.docx) or text; scanned PDFs (images of text) cannot be read. An optional "AI boost" lets a visitor add their own Anthropic API key, and the request then goes straight from their browser to Anthropic. It is off until a key is added. The Tailorly checks wording and keywords only. It cannot judge how good someone's experience is, and every suggestion should be checked for accuracy before it is used.

**Polish.** Real-ESRGAN's small general model (`realesr-general-x4v3`, about 4.7 MB, converted to ONNX) rebuilds detail in small photos and removes noise, running in the browser through ONNX Runtime Web. Polish first measures each photo (brightness, colour cast, contrast, noise, sharpness) and then applies only the fixes it needs: automatic levels and exposure, colour-cast correction, smart saturation, noise reduction and sharpening. Small photos get the AI upscale (2 to 4 times larger); larger photos get the light, colour and sharpness fixes without upscaling. On a processor the AI step handles photos up to about 320,000 pixels; browsers with WebGPU (recent Chrome or Edge) use the graphics card, check it against a known answer first, and handle photos up to about 2.2 million pixels. The model chip at the top right shows the engine state, and "Details" opens a report with a file check. AI upscaling can invent plausible detail that was not in the original, so it should not be used for evidence or identification.

## Privacy

- Files are processed on the visitor's device. The site has no server code and no database.
- There are no accounts, no tracking scripts and no ads.
- Polish processes photos entirely on the device, like the other tools.
- Upright edits and exports video entirely on the device; nothing is uploaded.
- The one exception is The Tailorly's optional AI boost, which sends the text to Anthropic only when the visitor adds a key and presses an AI button.
- Each tool stores its cached model and settings in the visitor's own browser.

## About this repository

Everything here is plain static files. There is no build step.

```
index.html      the hub page
clearcut/       Clearcut
verbatim/       Verbatim
stillreel/      Stillreel
tailorly/       The Tailorly
enhance/        Polish
upright/        Upright
CNAME           the custom domain (tinywebapps.in)
.nojekyll       tells GitHub Pages to publish the files as they are
```

The site is published with GitHub Pages from the `main` branch. Keep `CNAME` and `.nojekyll`. To update the site, change the files, commit, and push. The new version is live within a couple of minutes.

Some files are named with a short fingerprint (for example `model/m01-207643fe3d5d.dat`). Each page asks for exactly those files and checks them, so an old and a new upload are never mixed up. Please don't rename files inside the `model/`, `vendor/`, `music/` or `media/` folders.

### Running it on your own computer

The pages load their files with `fetch`, so they must be served over HTTP. Opening `index.html` by double-click will not work for most tools.

```
python3 -m http.server 8000
```

Then open http://localhost:8000 in a browser.

## Credits and licences

The tools use these open-source parts. The full licence texts are in each tool's page footer, under "Open-source licences".

- IS-Net (DIS), Apache License 2.0
- Real-ESRGAN (realesr-general-x4v3), BSD 3-Clause
- Whisper by OpenAI, MIT; ONNX versions from sherpa-onnx, Apache-2.0
- MiDaS depth model, MIT
- ONNX Runtime Web, MIT
- PDF.js, Apache-2.0, and fflate, MIT (The Tailorly)
- Fraunces, Instrument Sans and JetBrains Mono typefaces, SIL Open Font License (Polish, Upright and The Tailorly)

Images, recordings, videos and resumes that visitors process remain theirs, and no claim is made over them.

&copy; 2026 [Ashish Narayan](https://www.instagram.com/ashish.narayann/). All rights reserved, except as the open-source licences above allow.
