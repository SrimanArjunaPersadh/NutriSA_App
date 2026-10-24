# Cronometer

- App Store: https://apps.apple.com/us/app/cronometer-calorie-counter/id1145935738
- Rating: 4.77 from 99,656 ratings (US, 2026-10-20)
- Version: 4.59.5, released 2026-10-07

**Why it is here.** Depth over speed: 84+ nutrients, lab-verified data. The weakest search and multi-add scores here. Worth studying for the food card, not for the flow.

## What each screenshot shows

Files are in `app-store/`. `contact-sheet.jpg` has them all on one image.

- `01.jpg`: Brand cover with the diary at an angle.
- `02.jpg`: Diary at an angle: Targets bars (Energy, Protein, Net Carbs, Fat, with % right-aligned), meal groups with "+ Breakfast", "+ Lunch", entries with a timestamp "1:15 pm".
- `03.jpg`: Daily report: macronutrient target bars with %, then highlighted micronutrient targets in two columns.
- `04.jpg`: **Food card (dark)**: "Chicken Breast, Skinless" with a star, rows for Amount, Serving Size ("cup - 245g ▾"), Timestamp ("6:12 PM" with a checkbox), Group ("Dinner ▾"), the data source (NCCDB), Energy Summary ring "425 kcal" with Protein (76%) / Net Carbs (0%) / Fat (24%).
- `05.jpg`: Photo logging.
- `06.jpg`: Report tab: consumed ring with energy split by macro.
- `07.jpg`: Charts tab: stacked bars by day.
- `08.jpg`: Wearables.
- `09.jpg`: Trust logos.

## How logging works

- Each meal group has its own +.
- The food card sets amount, serving, timestamp and group (meal) in one place before adding.

## Take for NutriSA

- Show where the data came from on the food card (NutriSA: "Open Food Facts" or "Your food").
- Energy split by macro as % of kcal, which NutriSA already does with `macroEnergyShares`.
- An optional timestamp alongside the meal.

## Avoid

- A form-like food card (Amount / Serving / Timestamp / Group rows) is slow; most of it should be defaults.
- A dense diary.
