# Digital Trust (Fintech & Cybersecurity) Project Ideas

Early brainstorm for the HackHarvard 2026 Digital Trust track: "Build a project that makes that trust well deserved: tools that make digital services safer, fairer or more accessible, and tools that protect people, systems and data from threats."

## Shortlist

### 1. Scam Second Opinion (recommended)
Forward a suspicious text, email, screenshot or voicemail and get a plain-language verdict on whether it's a scam and why. Built for older adults, with a trusted family member looped in on high-risk hits.
- LLM + rules for urgency, gift cards, spoofed links, fake bank alerts
- Link and phone-number reputation checks
- SMS or web intake, one-tap "call my trusted contact"
- Demo live with real scam texts from the audience

### 2. Invoice Fraud Guard (runner-up)
Catches business email compromise: flags invoices where bank details, sender domain or tone changed from past messages. Aimed at small businesses that lose real money to this.
- Parse PDF invoices and email headers
- Diff payee details against vendor history
- Lookalike domain detection
- Gmail add-on or upload dashboard

### 3. Checkout Dark Pattern Detector
Browser extension that flags hidden fees, drip pricing, pre-checked add-ons and cancel traps before you pay.
- Content script reads the checkout DOM
- Compare advertised vs. final price
- Highlight manipulative elements in place
- Score sites and show a fairness badge

### 4. Data Broker Opt-Out Agent
Finds which people-search sites list you and drafts or submits the removal requests for you.
- Search a handful of major broker sites
- Generate CCPA/GDPR deletion requests
- Track request status in a dashboard
- Strong privacy story, harder live demo

### 5. Family Safe-Word Call Check
Defends against AI voice-clone "grandparent" scams with a shared challenge phrase and a quick verify flow before sending money.
- Pre-shared phrase or rotating code per family
- Verify request via a second channel
- Optional deepfake audio classifier
- Simple, emotional demo

## Recommendation

**Scam Second Opinion** covers both halves of the track (protecting money and spotting threats), targets a familiar, emotional problem, and is the easiest to demo live: paste in a real scam text and get a verdict in seconds. A small team can build a working version in a weekend with an LLM plus simple link and phone-number checks.

**Invoice Fraud Guard** is the stronger pick for a fintech-judge pitch built on "small businesses lose real money."
