# Research designs: food logging

What the best-rated and fastest food loggers do, and what NutriSA takes from them.
Collected 2026-10-20 for the `food-logger` branch.

## What is in this folder

| Path | What it is |
|---|---|
| `README.md` | This page: the ranking, the patterns, and the decisions for NutriSA |
| `<app>/notes.md` | One app: what each screenshot shows, how logging works, what to take, what to avoid |
| `<app>/app-store/01.jpg ...` | The app's current App Store screenshots, full resolution (1284 x 2778) |
| `<app>/contact-sheet.jpg` | All of that app's screenshots on one image, for a quick look |
| `app-store-meta.json` | App Store data for each app: version, rating, rating count, description, screenshot URLs |

The screenshots, contact sheets and `app-store-meta.json` are **gitignored**: they are the
companies' own images and copy, so they stay on this machine. On a fresh clone they will be
missing; re-fetch them from the App Store lookup API (`itunes.apple.com/lookup?id=<trackId>`,
ids in each app's `notes.md` link). The notes, this README and the prototype are committed.
| `prototype.html` | The clickable NutriSA mockup built from this research. Open it in a browser or the Mobile Preview extension |

Apps: `macrofactor`, `myfitnesspal`, `lose-it`, `mynetdiary`, `cronometer`, `yazio`,
`fatsecret`, `cal-ai`.

**Where the screenshots come from.** Apple's public App Store lookup API
(`itunes.apple.com/lookup?id=...`), which lists each app's store screenshots. These are
the companies' own marketing images, so they show the best version of each screen.
They are kept here as private design reference. Don't ship them or post them anywhere.

## The ranking

Two measures. Neither is perfect, so read them together.

**Logging speed.** MacroFactor's Food Logging Speed Index (FLSI, 2025) counts the
actions needed for four tasks. Lower is better. "slow" means outside their "strong"
band, where no number was published. MacroFactor made and ran this test, so treat it
as a guide.

| App | Search | Two foods (multi-add) | Barcode scan | Quick add calories |
|---|---|---|---|---|
| MacroFactor | **10** | **6** | **5** | **3** |
| MyNetDiary | 11 | 7 | 7 | 5 |
| Lose It | 13 | 7 | 7 | 5 |
| MyFitnessPal | 15 | slow | 7 | 5 |
| Yazio | 16 | slow | slow | slow |
| FatSecret | slow | 8 | 8 | slow |
| Cal AI | slow | 8 | slow | slow |
| Cronometer | slow | slow | 7 | 7 |

**User rating.** App Store (US), 2026-10-20.

| App | Rating | Ratings | Version |
|---|---|---|---|
| MacroFactor | 4.84 | 23,344 | 5.8.9 |
| MyNetDiary | 4.81 | 169,515 | 10.37 |
| Cal AI | 4.80 | 371,396 | 26.41.0 |
| Lose It | 4.77 | 781,478 | 18.5.600 |
| Cronometer | 4.77 | 99,656 | 4.59.5 |
| FatSecret | 4.72 | 15,368 | 11.9 |
| MyFitnessPal | 4.71 | 2,380,195 | 26.41.0 |
| Yazio | 4.70 | 51,317 | 26.41.2 |

The ratings are all close together, so they mostly tell you about popularity. The
speed index is the one that separates the apps.

## Patterns that show up in the winners

Each one names the apps it was seen in, with the screenshot to look at.

1. **The meal is chosen before you search.** On the day screen, every meal has its own
   +, so the logger opens already knowing the meal. Yazio (`yazio/02`: a + beside every
   meal), Lose It (`lose-it/02`), MyFitnessPal (`myfitnesspal/10`: "Log" on each meal).
2. **The meal is the logger's title, with a dropdown.** "Breakfast ▾" at the top of the
   search screen: FatSecret (`fatsecret/03`), MyFitnessPal (`myfitnesspal/04`). You can
   change it, but you rarely need to because of pattern 1.
3. **Modes in one row: Scan, Search, AI, Quick Add.** MacroFactor (`macrofactor/02`),
   FatSecret (`fatsecret/03`: camera, AI and barcode along the bottom of search).
4. **History ranked by the hour you usually eat it.** "3 PM Picks" in MacroFactor
   (`macrofactor/02`). MyNetDiary puts up to 5 of your own matches at the top of the
   results, highlighted (from their help pages).
5. **A + on every row adds the remembered serving.** Tapping the row itself opens the
   detail. MacroFactor (`macrofactor/02`), Yazio, Lose It. This is the "multi-add" that
   scores 6 to 7 actions.
6. **The plate, minified, always in view**, with the item count and one Log button.
   MacroFactor (`macrofactor/02`: "0 / 2476" and the food icons "+10" along the top,
   "Log Foods" at the bottom), MyFitnessPal (`myfitnesspal/04`: "3 items" beside "Log
   breakfast").
7. **Lead with what is left.** Calories remaining is the biggest number on the day view:
   Lose It (`lose-it/02`: "118 under"), MyNetDiary (`mynetdiary/01`: "1,750 left"),
   Yazio (`yazio/02`: "868 remaining"), Cal AI (`cal-ai/01`: "1250 calories left"),
   MyFitnessPal (`myfitnesspal/10`: "1,098 left").
8. **Macros as three small bars with "eaten / target"** under the calories: MyFitnessPal
   (`myfitnesspal/10`), Yazio, Cal AI (three rings), Cronometer (bars with %).
9. **The scan result opens the same food card as search**, and the card leads with one
   big calorie number: Lose It (`lose-it/06`: "95 Calories"), MyNetDiary
   (`mynetdiary/02`: "163 cals" with "Add to Diary").
10. **Timestamps instead of, or as well as, meals.** MacroFactor logs to a 24-hour
    timeline. Cronometer's food card has both "Timestamp 6:12 PM" and "Group: Dinner"
    (`cronometer/04`).

## Patterns to avoid

- **Long, dense result rows** (FatSecret `fatsecret/03`: three lines of green serving
  text and RDI % per result). Hard to scan. One serving line is enough.
- **Bright, playful branding over data** (Yazio's mascot, Lose It's orange header).
  NutriSA's locked dark palette already rules this out.
- **Photo-first logging as the main path** (Cal AI). Cal AI rates well, but it is
  outside the "strong" band on search, scan and quick add. AI is a future mode for us
  (Phase 8), never the only way in.
- **Paywalled basics.** Lose It moved barcode scanning to premium in 2022. FatSecret
  advertises "always free barcode scanner and no ads" as a selling point
  (`fatsecret/04`).
- **Too much on the day view.** Cronometer is known for depth, and its speed scores are
  the weakest here.

## What NutriSA takes (the prototype)

`prototype.html` is the result. Published copy: https://claude.ai/artifact/WSk84UVeJ68FYBSNZJgQQ1

| Prototype screen | Pattern | Seen in |
|---|---|---|
| Nutrition tab: calories left, three macro bars | 7, 8 | Lose It, MyNetDiary, Yazio, MyFitnessPal |
| Nutrition tab: a + on every meal card | 1 | Yazio, Lose It, MyFitnessPal |
| Nutrition tab: one "Log food" bar with scan | (our fix) | MacroFactor's single bottom bar |
| Logger: "Breakfast ▾" title | 2 | FatSecret, MyFitnessPal |
| Logger: Scan / Quick add / New food row | 3 | MacroFactor, FatSecret |
| Logger: "Usually at breakfast" | 4 | MacroFactor |
| Logger: "Your foods" first in results | 4 | MyNetDiary |
| Logger: + adds, row opens detail | 5 | MacroFactor, Yazio, Lose It |
| Logger: plate bar with Log | 6 | MacroFactor, MyFitnessPal |
| Food panel: big kcal, serving chips, "left today after this" | 9 | MacroFactor, Lose It, MyNetDiary |

## Sources

- MacroFactor, [the new food logger](https://macrofactor.com/new-food-logger/)
- MacroFactor, [fastest food logger, 2025 FLSI update](https://macrofactor.com/fastest-food-logger-2025/)
- MyNetDiary, [finding foods (help)](https://www.mynetdiary.com/adhelp_finding_foods.html)
- [Lose It review, calorie-trackers.com](https://calorie-trackers.com/reviews/lose-it/)
- App Store listings: the `trackViewUrl` of each app in `app-store-meta.json`
