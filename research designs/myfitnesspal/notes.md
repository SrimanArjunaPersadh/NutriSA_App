# MyFitnessPal

- App Store: https://apps.apple.com/us/app/myfitnesspal-calorie-counter/id341232718
- Rating: 4.71 from 2,380,195 ratings (US, 2026-10-20)
- Version: 26.41.0, released 2026-10-13

**Why it is here.** By far the most ratings (2.38M). Database size is its strength and its weakness: many duplicate results slow search down (15 actions).

## What each screenshot shows

Files are in `app-store/`. `contact-sheet.jpg` has them all on one image.

- `01.jpg`: Brand cover with a food photo and macro callouts.
- `02.jpg`: Search results as white cards: name, a green verified tick, "7 cal, 1 cup". Two lines per result.
- `03.jpg`: Nutrition report: stacked bar chart per day, a table of Carbs / Fat / Protein with Avg and Goal %, "Food highest in carbohydrates" list.
- `04.jpg`: **Meal scan result.** Header "Breakfast ▾" (the meal as a dropdown). Each detected food is a card with a verified tick, "240 cal, 1 avocado", and a red delete icon. Bottom bar: "3 items" on the left, a blue "Log breakfast" pill on the right.
- `05.jpg`: Voice logging: "Today ▾" header with a week strip of ticks, a calories bar, and a sheet with a big blue mic button and an example sentence.
- `06.jpg`: AI coach chat. Not relevant to logging.
- `07.jpg`: GLP-1 reminder sheet: "We prefilled day/time from your recent log".
- `08.jpg`: Meal planner and recipes.
- `09.jpg`: Barcode scan: camera view, then a card with the product name, a calorie ring (211 cal) and macros with % of energy.
- `10.jpg`: **Today view.** Week strip of ticks; Calories card "976 cal / 2,074" with "1,098 left" and one bar; Carbs / Fat / Protein each "125 g / 260" with a thin coloured bar; Diary list with "Breakfast ... Log".

## How logging works

- The Today view shows each meal in the Diary with its own Log button.
- Search, scan, voice and photo all land in a list of items for one meal, then one "Log breakfast" button.
- The meal is the header dropdown on the logging screens.

## Take for NutriSA

- "Breakfast ▾" as the logger's title.
- "3 items" + "Log breakfast" bottom bar: it says what is on the plate and names the meal on the button.
- Calories "eaten / target" with "N left" on the right, one bar.
- Three macro bars under it, each "g / target".

## Avoid

- White cards with drop shadows on grey: a light theme, not ours.
- Duplicate-heavy results from a user-fed database. NutriSA's Open Food Facts results need the same care (remove duplicates, your foods first).
