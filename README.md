# Trailblaze Tracker

A Honkai: Star Rail–themed productivity PWA built during a 15-day internship. Track habits, manage tasks, level up your Trailblazer, and stay consistent — all with an HSR aesthetic.

**Live demo:** [manunibhavsar.github.io/trailblaze-tracker](https://manunibhavsar.github.io/trailblaze-tracker)

---

## Features

- **Habit Tracker** — Daily habit logging with consecutive streak tracking and auto weekly reset
- **Task Manager** — Add, complete, and inline-edit tasks; earn Stellar Jade on completion
- **XP & Leveling System** — Gain XP from habits, tasks, and journal entries; unlock titles as you level up
- **Pomodoro Timer** — Focus sessions integrated with the XP and Jade system
- **Calendar** — Schedule and track events with a monthly view
- **Analytics** — Real daily snapshot charts tracking habit and task history over time
- **Journal** — Personal log entries tied to your productivity progress
- **Stellar Shop** — Spend earned Jade on titles, themes, badges, and effects
- **PWA** — Installable on mobile and desktop; works fully offline

---

## Tech Stack

- HTML5, CSS3, Vanilla JavaScript (no frameworks)
- PWA — service worker + web manifest for offline support and installability
- localStorage for client-side data persistence

---

## File Structure

```
trailblaze-tracker/
├── index.html
├── manifest.webmanifest
├── sw.js
├── css/
│   └── style.css
├── js/
│   └── app.js
└── screenshots/
    ├── dashboard.png
    ├── calendar.png
    ├── analytics.png
    └── shop.png
```

---

## Run Locally

```bash
git clone https://github.com/manunibhavsar/trailblaze-tracker.git
cd trailblaze-tracker
# Open index.html in any browser — no build step needed
```

To install as a PWA on mobile: open the live link in Chrome → tap the menu → **Add to Home Screen**.

---

## Author

**Manuni Bhavsar** — [LinkedIn](https://linkedin.com/in/manuni-b-877329381) · [GitHub](https://github.com/manunibhavsar)
