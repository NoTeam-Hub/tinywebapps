# Tiny Web Apps

**Free, private tools that run in your browser. No sign-up, no uploads, no price tag.**

Live at **https://tinywebapps.in**

Tiny Web Apps is one small website that hosts four tools, plus a hub page that links them together. Every tool does its work on the visitor's own device, so photos, recordings, videos and resumes are never sent to a server.

| Tool | Address | What it does |
|---|---|---|
| **Clearcut** | [/clearcut/](https://tinywebapps.in/clearcut/) | Removes the background from a photo and exports a transparent PNG. A precision brush lets you refine the edges. |
| **Verbatim** | [/verbatim/](https://tinywebapps.in/verbatim/) | Turns speech into text. Add an audio or video file, or record with the microphone, and copy the transcript. |
| **Stillreel** | [/stillreel/](https://tinywebapps.in/stillreel/) | Builds a video from photos and words: text scenes, a 3D depth effect on photos, music, and export to MP4 or WebM. |
| **The Tailorly** | [/tailorly/](https://tinywebapps.in/tailorly/) | Tailors a resume to a job post. Shows a match score, the missing keywords and stronger bullet points beside your text. |

## How each tool works

**Clearcut.** A segmentation model (IS-Net, from the DIS project) runs in the browser through WebAssembly. The model is about 47 MB. It loads when the page opens and the browser keeps it afterwards.

**Verbatim.** OpenAI's Whisper (Tiny or Base) runs in the browser through WebAssembly. Base is about 80 MB and Tiny about 45 MB. The model is downloaded once and then cached. Accuracy is best on clear speech in widely spoken languages, and weaker on noisy audio, names and less common languages.

**Stillreel.** A depth model (MiDaS, about 34 MB) gives photos a 3D camera move. If the model cannot load, the editor still works with a flat camera move. Exporting needs a browser with WebCodecs: Chrome, Edge, Safari 16.4 or newer, or Firefox 130 or newer on a computer.

**The Tailorly.** Matching, scoring and rewriting use plain text analysis written for this site. There are no model files. Resumes can be pasted or dropped in as PDF, Word (.docx) or text; scanned PDFs (images of text) cannot be read. An optional "AI boost" lets a visitor add their own Anthropic API key, and the request then goes straight from their browser to Anthropic. It is off until a key is added. The Tailorly checks wording and keywords only. It cannot judge how good someone's experience is, and every suggestion should be checked for accuracy before it is used.

## Privacy

- Files are processed on the visitor's device. The site has no server code and no database.
- There are no accounts, no tracking scripts and no ads.
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
- Whisper by OpenAI, MIT; ONNX versions from sherpa-onnx, Apache-2.0
- MiDaS depth model, MIT
- ONNX Runtime Web, MIT
- PDF.js, Apache-2.0, and fflate, MIT (The Tailorly)
- Fraunces, Instrument Sans and JetBrains Mono typefaces, SIL Open Font License

Images, recordings, videos and resumes that visitors process remain theirs, and no claim is made over them.

&copy; 2026 [@ashish.narayann](https://www.instagram.com/ashish.narayann/). All rights reserved, except as the open-source licences above allow.
