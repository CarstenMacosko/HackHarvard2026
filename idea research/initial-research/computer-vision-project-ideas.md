# HackHarvard 2026: Computer Vision Project Ideas

Oct 16, 2026 · @Carsten

> Exported from the Claude Doc [HackHarvard 2026: Computer Vision Project Ideas](https://claude.ai/code/artifact/8a8537e3-f40c-4928-882f-4af3837d1c8e).

## Shortlist

None of Regeneron's 31 starter sheets is an imaging problem. They are about documents, trial data and operations. So the ideas below find the vision problem hidden inside a bottleneck Regeneron already named, rather than starting from medical images.

**Top pick: ValidRun** (R1). Regeneron calls the GxP validation sheet "the one to beat," because no trial software can be used until it is validated. ValidRun records a person using the software once, then replays the test steps in a sandbox and uses vision to check each screenshot against the expected result. It also enters two sponsor challenges, Daytona and Factory Droid.

**Best if you want the vision to be the star: QTc Watch** (R2). It reads ECG images, measures the heart's QT interval, and flags dangerous prolongation for the medical monitor. QTc prolongation is a scenario the medical monitoring sheet names, and public datasets come with ground truth.

| # | Idea | Starter sheet it solves | Challenge | Vision core | Wow | Buildable in 36h |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | ValidRun: validation evidence from screen recordings | Software Speedrun (GxP validation) | Daytona, Factory Droid | Screenshot and UI-state verification | High | Medium |
| R2 | QTc Watch: ECG images to QTc safety flags | Signal, Not Noise (medical monitoring) | Chalk | ECG image digitization | High | High |
| R3 | SoA Lens: protocol schedule tables to structured data | How Extra Is Your Trial, Trial by Design | Factory Droid | Table structure recognition | Medium | High |
| R4 | FigureProof: checks every figure against the data | Biostatistician in a Box | Factory Droid, Daytona | Chart digitization | High | Medium |
| R5 | SOPcam: SOPs drafted from screen recordings | SOP, But Make It Make Sense | Chalk | Video to action steps | Medium | Medium |
| R6 | SourceCheck: scanned source documents versus trial data | Signal, Not Noise; Caught in 4K | Chalk | Document layout and handwriting OCR | Medium | High |
| R7 | TMF Inspector: missing signatures and dates before inspection | Inspection Szn | None | Signature and field detection | Low | High |
| R8 | LabelCheck: study drug labels versus country rules | Cleared for Takeoff | None | Multilingual label OCR and layout | Low | High |
| R9 | SkinTrack: remote eczema scoring by text message | Beyond the kit (fragile endpoints, Main Character Data) | Photon | Skin lesion segmentation | High | High |
| R10 | MoveScore: joint range of motion from a phone video | Beyond the kit (site burden in rare disease) | Photon | 3D pose estimation | High | Medium |

What the kit says judges reward, which applies to every idea:

- **Don't build a sheet literally.** The judging notes say teams that did so were "generally unsuccessful." Tie two sheets together, as R2 and R6 do with medical monitoring and protocol deviations.
- **Show it beats a baseline.** The medical monitoring sheet asks for a side-by-side with a naive rule set: time to detect, alerts per true signal, what each missed.
- **Readiness means a GitHub repo (MIT license preferred), a 3-minute video and a 10 to 12 slide deck**, plus a live demo in the judging room. It should run from a clean clone.
- **Humans decide.** Outputs are items for review, never diagnoses, and the blind is protected by default.
- **Book a feedback session** with the Regeneron mentor through the booking link in the kit, early on Saturday.

If your background is 3D reconstruction from video, **MoveScore** (R10) is where 3D skills show most, and video understanding carries ValidRun and SOPcam (R1, R5), which both read screen recordings.

## Regeneron: Reinvent Clinical Trials

Each idea names the starter sheet bottleneck it removes, the person whose work gets faster, and how to prove it on the kit's own data.

### R1. ValidRun: validation evidence from screen recordings

A person uses the software once while recording; ValidRun turns that into test scripts, replays them in clean sandboxes, checks every screenshot with vision, and assembles the validation package for Quality to sign.

- **Bottleneck (Software Speedrun):** No software can touch a real trial until it passes computer system validation under GAMP 5: requirements, installation, operational and performance qualification, a traceability matrix and a summary report. Today that means hand-run test scripts, pasted screenshots and signatures, for months, repeated after each change.
- **Who it helps:** Validation engineers and QA reviewers.
- **Vision core:** Segment the recording into steps (clicks, typing, page changes) to draft each test with its expected result. During replay, verify each screenshot against that expected result, for example "the audit trail shows who changed the record, when and why." After a software change, diff screenshots against the validated baseline to find what moved.
- **Challenge fit:** Daytona gives every run a fresh sandbox, so installation checks are clean and runs are reproducible. Factory Droid writes the browser test scripts from the requirements and recording, runs them, and repairs broken selectors.
- **What to validate:** A small app with Part 11 controls (audit trail, electronic signature with name, time and meaning) that you build in a few hours, or another team's hackathon project.
- **Demo moment:** Change one requirement. ValidRun reruns only the tests it traces to, shows the screenshot where the audit trail entry is missing, marks it failed, and blocks the author from approving their own test.
- **Risks:** A vision check alone can pass a wrong screen. Pair every vision check with a DOM assertion, and say plainly that nothing is faked and humans sign.

### R2. QTc Watch: ECG images to QTc safety flags

Reads ECGs that arrive as PDFs, scans or phone photos, measures the QT interval, and gives the medical monitor a short list of real QTc concerns instead of an alert for every borderline value.

- **Bottleneck (Signal, Not Noise):** Medical monitors drown in low-value alerts. The sheet lists QTc prolongation (above 500 ms, or a large rise from baseline) as a scenario that must surface fast, and lists "abnormal at baseline and unchanged" and duplicates as noise that must not.
- **Who it helps:** Medical monitors and clinical scientists.
- **Vision core:** Find the grid and the leads, calibrate millimeters to milliseconds and millivolts, trace the waveform into a signal, detect QRS onset, T-wave end and RR interval, and compute QTcF (Fridericia correction). Score image quality so a bad scan becomes "repeat the ECG," not a false alarm.
- **Data:** PTB-XL provides about 21,800 twelve-lead ECGs, and ecg-image-kit (from the PhysioNet 2024 ECG digitization challenge) renders them as realistic paper images with wrinkles and shadows, so ground truth comes free. The CDISC pilot SDTM data in the kit has an ECG domain for the trial stream.
- **Challenge fit:** Chalk. The agent reviews each data cut, and Chalk evals score it against the planted answer key.
- **Demo moment:** Photograph a printed ECG, see the traced waveform and QTcF of 512 ms appear as a review item with evidence. Then show the side-by-side the sheet asks for: alerts per true signal and time to detect, against a naive "flag every QTc above 450" baseline.
- **Risks:** T-wave end detection is hard on noisy leads; use median beats across leads and show confidence.

### R3. SoA Lens: protocol schedule tables to structured data

Drop in a protocol PDF; SoA Lens rebuilds its Schedule of Activities grid as structured data, then shows patient burden, site workload, cost, and how the trial compares with similar ones.

- **Bottleneck (How Extra Is Your Trial; Trial by Design):** Protocols are documents whose contents get retyped into every system. Database build averages 68 days after the protocol is final, and Phase II and III protocols now average about 20 endpoints and 31 eligibility criteria. The complexity sheet asks whether the schedule of visits can be reconstructed from public documents.
- **Who it helps:** Protocol authors, study startup teams, and feasibility planners.
- **Vision core:** Detect the schedule tables in the PDF, recognize table structure including merged header cells and multi-page continuations, read the X marks and visit windows, and link footnote markers to their text. Output CDISC USDM v4 data (activities by visits).
- **Challenge fit:** Factory Droid generates downstream artifacts in the running product from that data: a database visit structure, a lab kit schedule, and the visit section of a consent form.
- **Data:** ClinicalTrials.gov hosts protocol PDFs for many industry trials. Hand-label 15 to 20 schedule tables for evaluation.
- **Demo moment:** A real Phase 3 protocol becomes an editable grid in seconds, with a burden summary (visits, blood draws, hours per patient) and a percentile against similar trials.

### R4. FigureProof: check every figure against the data

Digitizes each figure in a study report, regenerates it from the analysis datasets in a sandbox, and flags any mismatch.

- **Bottleneck (Biostatistician in a Box):** Turning trial data into submission tables, figures and listings relies on manual programming and long validation, usually by double programming. FigureProof is the checking half, so it does not build the sheet literally.
- **Who it helps:** Statistical programmers and biostatisticians.
- **Vision core:** Detect axes and ticks, read labels, extract each curve by color, and convert pixels back to data. Kaplan-Meier curves with their number-at-risk tables and forest plots are the two figure types to support.
- **Challenge fit:** Factory Droid reads the statistical analysis plan and writes R code to reproduce each figure; Daytona runs that code in isolated sandboxes.
- **Data:** The CDISC pilot study's SDTM and ADaM data, which the kit recommends. The kit's reading on LLM-generated clinical study reports shows why checking matters.
- **Demo moment:** Seed one error, a shifted curve or a wrong at-risk count, and FigureProof overlays both curves and highlights where they part.

### R5. SOPcam: SOPs drafted from screen recordings

Record someone doing a regulated task; SOPcam writes the SOP, then compares it with the existing SOP library to show where practice and paper have drifted apart.

- **Bottleneck (SOP, But Make It Make Sense):** Companies keep hundreds of SOPs written from memory, which overlap, contradict each other, and drift from real work. Inspectors check that people follow them.
- **Who it helps:** Quality and process owners.
- **Vision core:** Keyframe extraction, cursor and click detection, and screen OCR turn the video into an action sequence, which is then grouped into steps. Compare steps against written SOPs to find steps done but not written, and written but not done.
- **Data and evals:** The sheet cites Stanford's WONDERBREAD benchmark (2,928 workflow demonstrations across 598 workflows, scored by step precision and recall). Report your scores on it. Chalk evals fit here.
- **Connects to R1:** The same recording can drive both the SOP and the validation tests, which is the kind of linking the judges reward.

### R6. SourceCheck: scanned source documents versus trial data

Reads scanned hospital records (discharge summaries, lab printouts, visit worksheets) and flags where they disagree with the trial database, drafting a query for each.

- **Bottleneck (Signal, Not Noise; Caught in 4K):** The medical monitoring sheet lists "an event in a narrative but not on the AE form" and "a hospitalization with no SAE" as items that must surface. The deviations sheet adds visits outside their window and missing required tests, which today are found weeks later by site monitors.
- **Who it helps:** Site monitors (CRAs), data managers, and medical monitors.
- **Vision core:** Document layout detection, handwriting and print OCR, table extraction, and date and event extraction, matched against SDTM adverse event, visit and lab domains.
- **Data:** Use Synthea and the CDISC pilot data to render synthetic source documents with handwriting fonts, skew and noise, and plant a known list of inconsistencies as the answer key.
- **Challenge fit:** Chalk, scored on planted discrepancies found and duplicate queries avoided.
- **Demo moment:** A 200-page stack collapses to nine discrepancies, each showing the cropped source snippet beside the database value and a drafted query.

### R7. TMF Inspector: missing signatures and dates before inspection

Scans a trial master file and flags documents that are unsigned, undated, misfiled, or signed by someone with no training record.

- **Bottleneck (Inspection Szn):** Inspection readiness is a last-minute manual check that records are "complete, signed, and filed" and that "training records match who did the work."
- **Who it helps:** Clinical quality and study managers.
- **Vision core:** Document type classification, detection of signature and date fields and whether they are filled, and reading signer names to match against training and delegation logs.
- **Data:** RVL-CDIP for document classification, Tobacco800 for signature detection, and synthetic trial documents for the demo.
- **Demo moment:** A site's file gets a readiness score, with each gap linked to the FDA inspection observation it would likely cause.

### R8. LabelCheck: study drug labels versus country rules

Reads study drug label proofs and multilingual booklet labels and checks each against the rules of every country it ships to.

- **Bottleneck (Cleared for Takeoff):** Each country has its own label rules (EU CTR Annex VI, the US caution statement under 21 CFR 312.6). A missed requirement can hold a shipment at customs for weeks while patients wait.
- **Who it helps:** Clinical supply and labeling teams.
- **Vision core:** Multilingual OCR, language identification per booklet page, and layout detection of required elements (protocol code, batch, expiry, storage, sponsor, investigational-use statement).
- **Data:** Render synthetic label proofs from templates, with some required elements deliberately missing.

### R9. SkinTrack: remote eczema scoring by text message

Patients text skin photos to a trial number; an agent coaches retakes and gives the site an EASI-style severity estimate to confirm.

- **Bottleneck (beyond the kit):** Dermatology endpoints like EASI need in-clinic visits and vary between raters. The Main Character Data sheet calls this out as a fragile critical-to-quality factor: "an endpoint measured in a hard-to-standardize way."
- **Who it helps:** Site investigators and patients, who make fewer trips.
- **Vision core:** A capture-quality gate (blur, exposure, distance, body region), lesion segmentation for area per region, and per-sign severity, with a color reference card to normalize lighting.
- **Challenge fit:** Photon, so the agent lives on iMessage and SMS.
- **Data:** Google's SCIN dataset, plus Fitzpatrick17k and DDI to report performance across skin tones.

### R10. MoveScore: joint range of motion from a phone video

A patient records a short guided video at home; MoveScore reconstructs joint angles in 3D and reports range of motion over time.

- **Bottleneck (beyond the kit):** Rare-disease trials measure mobility, and patients often travel far to few sites, which slows enrollment and adds visits.
- **Who it helps:** Patients in rare-disease trials and site staff.
- **Vision core:** 2D keypoints lifted to 3D (or two phones for multi-view), joint angles, and a repeatability check across takes.
- **Challenge fit:** Photon sends reminders and instructions and receives the video in the chat.
- **Data:** Your own recordings against a goniometer; Human3.6M or AIST++ to check 3D accuracy.

### Dropped from the first list

- **OCT and RECIST reading copilots:** Real bottlenecks, but central imaging reading is a mature vendor service and no starter sheet points at it, so judges may see it as less fresh.
- **DoseCam, TrialPay, KitCount, EyeMatch:** The vision was thin or the trial bottleneck was weak next to the ideas above.

## Other tracks

Only PlumeWatch fits the SpaceXAI challenge, because it is built on real space data; the general Digital Trust ideas are being brainstormed in a separate thread, so these stay computer vision only.

### O1. PlumeWatch: methane plumes from the ISS

Detect methane super-emitters (landfills, oil and gas sites) in imagery from NASA's EMIT spectrometer on the Space Station, and turn each detection into a narrated briefing.

- **Track and challenges:** Save the Earth plus SpaceXAI "Make It Legendary." Build in Cursor; use the Grok Voice API to narrate each plume briefing and Grok Imagine to visualize the plume over the site. Post the build for the ASUS content challenge too.
- **CV core:** Plume segmentation on EMIT's methane enhancement products, attribution to the nearest facility, and change detection across overpasses to spot persistent leaks.
- **Data:** EMIT Level 2B methane plume products from NASA's LP DAAC, with published plume lists for labels.
- **Demo moment:** A map pin over a real landfill, a voice briefing of its estimated emission rate, and a timeline showing it leaking on three passes.

### O2. CheckGuard: catch altered checks before mobile deposit

A mobile deposit screen that detects washed or edited checks (changed amount, payee or date) before the deposit reaches the bank.

- **Track and challenges:** Digital Trust plus Capital One Nessie, which handles the account and deposit once the check passes.
- **CV core:** Field localization and OCR, a consistency check between the written and numeric amounts, and tamper detection (error level analysis, ink and font inconsistency, local noise mismatch).
- **Data:** Generate synthetic checks, then make altered copies with known edited regions for labels.
- **Demo moment:** The same check photographed before and after a teammate edits the amount; one deposits, the other is held with the edit outlined.

### O3. TrayCam: dining hall food waste by dish

A camera over the tray return identifies each dish and estimates how much was left uneaten, so dining staff can cut portions of the dishes people waste most.

- **Track and challenges:** Save the Earth, with the live tally on an ASUS monitor beside the return station and the ASUS content challenge as a bonus.
- **CV core:** Food segmentation per dish and leftover volume estimation from a before/after pair or a depth camera.
- **Data:** FoodSeg103 and UECFood-256, plus your own photos at a Harvard dining hall.

## Data and models cheat sheet

Rows marked "Kit" are recommended in Regeneron's starter sheets; the rest are from my own knowledge and the links were not opened, so check them first. Request anything that needs registration at the start, since approval can take hours.

| Resource | Used by | What it gives you | Named in |
| --- | --- | --- | --- |
| [CDISC SDTM/ADaM pilot data](https://github.com/cdisc-org/sdtm-adam-pilot-project) | R2, R4, R6 | Realistic trial domains: AE, labs, ECG, visits, site IDs | Kit |
| pharmaversesdtm and pharmaverseadam (R packages) | R2, R4, R6 | The same pilot data packaged for R | Kit |
| [Synthea](https://synthea.mitre.org/) | R6 | Synthetic patient histories to render as source documents | Kit |
| [ClinicalTrials.gov](https://clinicaltrials.gov/) | R3 | Protocol and SAP PDFs, eligibility, schedules | Kit |
| openFDA drug label API | R2, R6 | Approved labels as stand-in reference safety information | Kit |
| GAMP 5, 2nd edition (PDF in the kit's Cool Reads folder) | R1 | The validation lifecycle and deliverables | Kit |
| WONDERBREAD benchmark | R5 | 2,928 workflow recordings with SOP precision and recall scoring | Kit |
| CDISC USDM v4 | R3 | Data model for a study design | Kit |
| [PTB-XL](https://physionet.org/content/ptb-xl/) | R2 | About 21,800 twelve-lead ECGs | My knowledge |
| [ecg-image-kit](https://github.com/alphanumericslab/ecg-image-kit) | R2 | Renders ECG signals as realistic paper images | My knowledge |
| [Table Transformer](https://github.com/microsoft/table-transformer) | R3 | Table detection and structure recognition | My knowledge |
| RVL-CDIP and Tobacco800 | R7 | Document classes and signature detection | My knowledge |
| [SCIN](https://github.com/google-research-datasets/scin), Fitzpatrick17k, DDI | R9 | Skin photos, with skin-tone labels for fairness checks | My knowledge |
| [MediaPipe](https://ai.google.dev/edge/mediapipe) | R10 | Pose keypoints on device | My knowledge |
| [EMIT](https://earth.jpl.nasa.gov/emit/) | O1 | Methane plume products from the ISS | My knowledge |
| [Nessie](https://nessieisreal.com/) | O2 | Capital One mock banking API | Hackathon page |

Kit links worth bookmarking: [industry trials with posted protocols](https://clinicaltrials.gov/search?aggFilters=docs:prot,funderType:industry) (R3's source PDFs), the [ClinicalTrials.gov API](https://clinicaltrials.gov/data-api/api), [WONDERBREAD](https://github.com/HazyResearch/wonderbread), [CDISC USDM reference architecture](https://github.com/cdisc-org/DDF-RA), [pharmaversesdtm](https://r-packages.io/packages/pharmaversesdtm) and [admiral](https://github.com/pharmaverse/admiral) for building ADaM in R.

The kit also includes the Tufts 2024 AI benchmark, a clinical trial cost study, a data anomaly detection paper and a paper on LLM-written study reports, which are useful for the "why this matters" slide.
