import { useState, useEffect } from "react";

const STORAGE_KEY = "nikhil-food-log-v1";

const initialLog = {
  "2026-03-22": {
    label: "Ski Day + Costco",
    meals: [
      { id: "m1", time: "All day", label: "Breakfast + Costco Post-Ski", items: [
        { name: "Cookie + yogurt (5–6 tbsp) + nuts + cereal", kcal: 545 },
        { name: "Costco pizza slice + nacho chips + corn dip", kcal: 865 },
      ]},
    ],
    health: { steps: 19307, active_kcal: 1058, basal_kcal: 1525, rhr: 54, sleep_hours: 7.1, sodium_mg: 1800 }
  },
  "2026-03-23": {
    label: "UAF Day",
    meals: [
      { id: "m1", time: "All day", label: "Breakfast + UAF Cafeteria + Snacks", items: [
        { name: "Banana, sourdough x2, mayo, cheddar, tomato", kcal: 506 },
        { name: "2 salad plates + ranch + creamy sauce + garlic bread", kcal: 855 },
        { name: "Ice cream + cookie + apple filling + Kirkland bar", kcal: 760, notes: "~10g protein" },
      ]},
    ],
    health: { steps: 17962, active_kcal: 1087, basal_kcal: 1582, rhr: 57, sleep_hours: 5.1, sodium_mg: 2600 }
  },
  "2026-03-24": {
    label: "Ski + Lab + Errands",
    meals: [
      { id: "m1", time: "All day", label: "Calzones + Drinks + Snacks", items: [
        { name: "Rich chai half & half (~2 cups)", kcal: 460 },
        { name: "UAF veggie calzone × 2 (confirmed: 690 kcal each)", kcal: 1380, notes: "~60g protein" },
        { name: "Ice cream, Kirkland bar, chips, corn dip, cookie, Kodubale, bananas", kcal: 1168 },
      ]},
    ],
    health: { steps: 15978, active_kcal: 1151, basal_kcal: 1552, rhr: 49, sleep_hours: 5.3, sodium_mg: 3200, notes: "Skiing Smith Lake ✅. HW8 submitted ✅." }
  },
  "2026-03-25": {
    label: "Protein Anchor Day 1 ✅ + Bike Ride",
    meals: [
      { id: "m1", time: "Morning", label: "Breakfast 🥛", protein_highlight: true, items: [
        { name: "Greek yogurt (~0.85 cups)", kcal: 145, notes: "~14g protein" },
        { name: "Banana + almonds + honey + chai + black tea", kcal: 543, notes: "~15g protein" },
      ]},
      { id: "m2", time: "Evening", label: "Dinner + Snacks 🎯", protein_highlight: true, items: [
        { name: "Brownie + Beyond Burger × 1.5 + cheese + greens + mayo", kcal: 1125, notes: "~42g protein" },
        { name: "Quaker bars × 2 + Kirkland bar (Hershey's swap)", kcal: 510, notes: "~12g protein" },
      ]},
    ],
    health: { steps: 14118, active_kcal: 1131, basal_kcal: 1579, rhr: 55, sleep_hours: 5.5, sodium_mg: 2400, notes: "Skiing SRC ✅. Bike ride Zone 4 ✅. Brighton ✅." }
  },
  "2026-03-26": {
    label: "Protein Anchor Day 2 ✅",
    meals: [
      { id: "m1", time: "All day", label: "Yogurt + Smart Dogs + Calzone 🎯", protein_highlight: true, items: [
        { name: "Greek yogurt (~1 cup)", kcal: 170, notes: "~17g protein" },
        { name: "Nuts + cereal + banana", kcal: 308 },
        { name: "Smart Dogs × 3 + salad + dressing", kcal: 315, notes: "~30g protein" },
        { name: "UAF veggie calzone × 1 (confirmed)", kcal: 690, notes: "~30g protein" },
        { name: "Brownie + Whoppers + Hershey's mini", kcal: 405 },
      ]},
    ],
    health: { steps: 16135, active_kcal: 1045, basal_kcal: 1556, rhr: null, sleep_hours: 6.7, sodium_mg: 3500, notes: "Brighton ✅." }
  },
  "2026-03-27": {
    label: "Protein Anchor Day 3 ✅ + Pizza Night",
    meals: [
      { id: "m1", time: "All day", label: "Yogurt + Alfredo + Smart Dogs + Pizza 🍕", protein_highlight: true, items: [
        { name: "Greek yogurt (~2 cups)", kcal: 340, notes: "~34g protein" },
        { name: "Nuts + 1.5 bananas + chai", kcal: 488 },
        { name: "Alfredo + Smart Dogs × 3 + parmesan + salad + bundt slice", kcal: 765, notes: "~39g protein" },
        { name: "Homemade whole wheat pizza × 4 slices (Beyond + Quorn, tomato soup base)", kcal: 1080, notes: "~28g protein" },
      ], note: "~110g protein 🎯" },
    ],
    health: { steps: 18053, active_kcal: 913, basal_kcal: 1564, rhr: 54, sleep_hours: 6.4, sodium_mg: 2800 }
  },
  "2026-03-28": {
    label: "Protein Anchor Day 4 ✅",
    meals: [
      { id: "m1", time: "All day", label: "Yogurt + PB + Pizza 🥛", protein_highlight: true, items: [
        { name: "Greek yogurt (~1.5 cups)", kcal: 255, notes: "~25g protein" },
        { name: "3 dozen nuts + 2 bananas + PB + cookie + chai + Kirkland bar", kcal: 1110, notes: "~39g protein" },
        { name: "Leftover pizza × 2 slices + tomatoes + bell pepper", kcal: 565, notes: "~15g protein" },
      ]},
    ],
    health: { steps: 14314, active_kcal: 962, basal_kcal: 1454, rhr: 51, sleep_hours: 7.5, sodium_mg: 2100, sleep_note: "12:29 AM → 8:02 AM. Excellent deep sleep.", notes: "RHR 51 bpm 🫀" }
  },
  "2026-03-29": {
    label: "Protein Anchor Day 5 ✅",
    meals: [
      { id: "m1", time: "All day", label: "Yogurt + PB + Hummus + Costco Pizza 🎯", protein_highlight: true, items: [
        { name: "Greek yogurt (~0.9 cups)", kcal: 153, notes: "~15g protein" },
        { name: "2 dozen nuts + 2 bananas + chai + sourdough x2 + PB (5 tbsp)", kcal: 1050, notes: "~42g protein" },
        { name: "Leftover pizza × 2 slices", kcal: 540, notes: "~14g protein" },
        { name: "Hummus (~4oz) + Simply Protein chips (~14 chips)", kcal: 390, notes: "~15g protein" },
        { name: "Costco cheese pizza + parmesan × 2 + Kirkland bar", kcal: 940, notes: "~44g protein" },
      ]},
    ],
    health: { steps: 16110, active_kcal: 964, basal_kcal: 1550, rhr: 56, sleep_hours: 6.8, sodium_mg: 3800 }
  },
  "2026-03-30": {
    label: "Deadline Eve 🚨 — Protein Anchor Day 6",
    meals: [
      { id: "m1", time: "All day", label: "Shake + Pizza + PB + Salad 🥛", protein_highlight: true, items: [
        { name: "Orgain shake + blueberries + strawberries + oat milk", kcal: 480, notes: "~25g protein" },
        { name: "Large pizza slice + extra cheddar", kcal: 660, notes: "~28g protein" },
        { name: "PB (4–5 tbsp) + 2 bananas + cookie × 2 + sourdough + butter + half mug chai", kcal: 1190, notes: "~26g protein" },
        { name: "Store-bought pizza slice + mozz ~1/5 log + extra cookie + ice cream + salad", kcal: 810, notes: "~22g protein" },
      ], note: "~123g protein. Skiing ✅. Focusmate ✅." },
    ],
    health: { steps: 14095, active_kcal: 1111, basal_kcal: 1551, rhr: 53, sleep_hours: 7.75, sodium_mg: 1800, sleep_note: "11:40 PM → 8:08 AM. Best sleep of the log." }
  },
  "2026-03-31": {
    label: "Deadline Eve 2 🚨 — Protein Anchor Day 7",
    meals: [
      { id: "m1", time: "All day", label: "Shake + Yogurt + Salad + Pizza + Bars + Sweets 🎯", protein_highlight: true, items: [
        { name: "Breakfast: yogurt ⅓ cup + granola + banana + maybe sourdough/PB", kcal: 440, notes: "~17g protein" },
        { name: "Orgain shake + Greek yogurt (~0.85 cups) + 2 dozen nuts + ½ cup granola", kcal: 870, notes: "~44g protein" },
        { name: "Smart Dog × 1 + salad + parmesan + Caesar + small pizza + mozz × 1.5 + chai", kcal: 880, notes: "~34g protein" },
        { name: "Kirkland bars × 2 + hummus + Simply Protein chips × 2 servings", kcal: 730, notes: "~36g protein" },
        { name: "Cinnamon roll + frosting + Hershey's + cream egg + nacho cheese", kcal: 620, notes: "~7g protein ⚠️ sodium" },
      ]},
    ],
    health: { steps: 12102, active_kcal: 682, basal_kcal: 1529, rhr: null, sleep_hours: 6.4, sodium_mg: 2800 }
  },
  "2026-04-01": {
    label: "DEADLINE DAY 🚨 — Protein Anchor Day 8",
    meals: [
      { id: "m1", time: "Morning", label: "Breakfast", protein_highlight: true, items: [
        { name: "Sourdough toast + butter", kcal: 120, notes: "~3g protein" },
        { name: "Peanut butter (3 tbsp)", kcal: 285, notes: "~12g protein" },
        { name: "Half mug chai — half & half", kcal: 160, notes: "~1g protein" },
      ]},
      { id: "m2", time: "Dinner", label: "Burrito + Alfredo + Pizza 🏆", protein_highlight: true, items: [
        { name: "Large flour tortilla", kcal: 200, notes: "~5g protein" },
        { name: "Beyond meat crumbles", kcal: 150, notes: "~10g protein" },
        { name: "Simple Truth chorizo × 1 (confirmed: 27g protein)", kcal: 230, notes: "~27g protein ⚠️ 510mg sodium" },
        { name: "Tillamook + FM extra sharp cheddar", kcal: 180, notes: "~12g protein" },
        { name: "Sour cream + 2 tomatoes + 3 dozen lettuce", kcal: 130, notes: "~2g protein" },
        { name: "Alfredo + white sauce pizza slice + extra cheddar", kcal: 430, notes: "~12g protein" },
        { name: "Kirkland protein bar (possible)", kcal: 190, notes: "~10g protein" },
      ]},
    ],
    health: { steps: 7624, active_kcal: 506, basal_kcal: 1548, rhr: 58, sleep_hours: null, sodium_mg: 2400, notes: "Engineering deadline submitted ✅" }
  },
  "2026-04-02": {
    label: "Post-Deadline 🎉 — Protein Anchor Day 9",
    meals: [
      { id: "m1", time: "All day", label: "Yogurt + Enchilada + Salad 🥛", protein_highlight: true, items: [
        { name: "Greek yogurt (~2 cups)", kcal: 340, notes: "~34g protein" },
        { name: "Granola (~1.4 cups — oats, coconut, almonds)", kcal: 560, notes: "~7g protein" },
        { name: "2 bananas", kcal: 210 },
        { name: "Green chile enchilada × 2 portions (refried beans, corn, green chile, 3-cheese blend, sour cream)", kcal: 700, notes: "~26g protein" },
        { name: "Mozzarella (separate) + salad + 3 tomatoes", kcal: 190, notes: "~11g protein" },
        { name: "Cookie (~2.5× piece) + chocolate (~150 kcal) + half mug chai", kcal: 510, notes: "~5g protein" },
      ]},
    ],
    health: { steps: 11548, active_kcal: 707, basal_kcal: 1351, rhr: 50, sleep_hours: null, sodium_mg: 700, notes: "Cleanest sodium day of the log ✅" }
  },
  "2026-04-03": {
    label: "Post-Deadline Day 2 🎉 — Protein Anchor Day 10",
    meals: [
      { id: "m1", time: "All day", label: "Yogurt Bowl + Enchilada + Snacks 🥛", protein_highlight: true, items: [
        { name: "Greek yogurt (~1.1 cups — confirmed 1/5–1/6 of 48oz Costco)", kcal: 135, notes: "~25g protein" },
        { name: "2 dozen mixed nuts", kcal: 165, notes: "~5g protein" },
        { name: "Granola (~½ cup — oats, cashews, almonds, walnuts, pecans)", kcal: 200, notes: "~5g protein" },
        { name: "Peanut butter (2.5 tbsp)", kcal: 240, notes: "~10g protein" },
        { name: "2 bananas", kcal: 210 },
        { name: "Half homemade green chile enchilada (morning)", kcal: 175, notes: "~6g protein" },
        { name: "Simply Protein chips (~4) + corn & cheese dip + kodubale × 7 + tortilla strips × 6", kcal: 335, notes: "~6g protein" },
        { name: "Chai × 1.5 mugs (half & half)", kcal: 240, notes: "~1.5g protein" },
        { name: "Hershey's chocolate × 2 pieces", kcal: 60 },
      ]},
    ],
    health: { steps: 10147, active_kcal: 434, basal_kcal: 1511, rhr: 58, sleep_hours: null, sodium_mg: 650, notes: "Total burn 1,945 kcal (Apple Health confirmed). ~185 kcal deficit ✅" }
  },
  "2026-04-04": {
    label: "Saturday — Domino's + Rae 🍕",
    meals: [
      { id: "m1", time: "So far", label: "Chai + Cookie ☕", items: [
        { name: "Half serving chai — half & half", kcal: 80, notes: "~0.5g protein" },
        { name: "Homemade cookie × 1.75 piece (oat/almond/agave)", kcal: 140, notes: "~3g protein" },
      ]},
      { id: "m2", time: "Morning", label: "Yogurt Bowl 🥛", protein_highlight: true, items: [
        { name: "Greek yogurt (~1.6 cups)", kcal: 270, notes: "~27g protein" },
        { name: "Nuts + granola combined (~1 cup total)", kcal: 450, notes: "~10g protein" },
        { name: "2 bananas", kcal: 210 },
        { name: "¾ tsp honey", kcal: 15 },
      ]},
      { id: "m3", time: "Afternoon/Evening", label: "PB + Apple + Domino's with Rae 🍕", protein_highlight: true, items: [
        { name: "Peanut butter (4 tbsp)", kcal: 380, notes: "~16g protein" },
        { name: "Apple", kcal: 95 },
        { name: "Parmesan bread bites × 3", kcal: 150, notes: "~4g protein" },
        { name: "Doritos × 5–6", kcal: 60, notes: "~1g protein" },
        { name: "Domino's handmade pan pizza × 2.5 slices (tomato, green pepper, mushroom, olive, onion, banana pepper, feta)", kcal: 750, notes: "~25g protein — ⚠️ ~2,000mg sodium" },
        { name: "Garlic dipping sauce (~½ dipping cup)", kcal: 125 },
        { name: "Mixed veggies × 7 (carrot, cauliflower, broccoli, bell pepper) + ~1 tsp sour cream/mayo dip", kcal: 60 },
        { name: "Smaller Domino's pan pizza slice (extra, ~80% size)", kcal: 240, notes: "~8g protein — ⚠️ +700mg sodium" },
        { name: "Truly hard soda (12oz)", kcal: 100 },
      ]},
    ],
    health: { steps: 11738, active_kcal: 864, basal_kcal: 1214, rhr: null, sleep_hours: 7.7, sodium_mg: 2600, sleep_note: "~11:40 PM → 7:20 AM AKDT. 7.7h — solid deep sleep.", notes: "Skiing ✅ (steps confirmed Apple Health). Evening with Rae 🍕" }
  },
  "2026-04-05": {
    label: "Sunday — Domino's Day 2 🍕",
    meals: [
      { id: "m1", time: "All day", label: "Pizza + Sweets + Beer 🍕", items: [
        { name: "Domino's handmade pan pizza × 4 slices (veggie toppings + feta)", kcal: 1320, notes: "~40g protein — ⚠️ ~3,200mg sodium" },
        { name: "Garlic dipping cup (~5/6 full)", kcal: 210 },
        { name: "Cream cheese (1 tsp) + vanilla pudding (5–6 tbsp)", kcal: 135, notes: "~3g protein" },
        { name: "Cake slice (~⅓ standard — 4-tier vanilla, pudding filling, cream cheese frosting)", kcal: 150, notes: "~2g protein" },
        { name: "Ice cream 1.25 scoops (vanilla + chocolate)", kcal: 200, notes: "~2g protein" },
        { name: "Asparagus × 1 (pan baked) + 2 small carrot pieces", kcal: 40, notes: "~1g protein" },
        { name: "Beer (1 can)", kcal: 150 },
      ], note: "No yogurt anchor — protein low. Sodium 🔴 from pizza stack. But ~278 kcal deficit on 15,255 steps ✅" },
    ],
    health: { steps: 15255, active_kcal: 1064, basal_kcal: 1419, rhr: 64, sleep_hours: 4.3, sodium_mg: 3800, sleep_note: "5:25 AM → 9:43 AM AKDT — 4.3h, watch accurate. RHR 64 — elevated from alcohol.", notes: "15,255 steps ✅. Deficit ~278 kcal despite pizza + sweets + beer." }
  },
  "2026-04-06": {
    label: "Monday — Dr. Shobha 6:30 PM",
    meals: [
      { id: "m1", time: "Morning", label: "Tea + Yogurt Bowl 🥛", protein_highlight: true, items: [
        { name: "Tea + oat milk splash + 1.5 tbsp honey", kcal: 70 },
        { name: "Greek yogurt (~1.5 cups, ¼ of 48oz Costco)", kcal: 255, notes: "~25g protein" },
        { name: "Granola + nuts combined (~¾ cup total)", kcal: 340, notes: "~8g protein" },
        { name: "1.5 bananas", kcal: 158 },
      ]},
      { id: "m2", time: "Afternoon", label: "Tofu Bunny + Gravy + Chocolate 🐰", protein_highlight: true, items: [
        { name: "Homemade tofu bunny (~20–25 bites, ~180g — mostly tofu, onion broth)", kcal: 125, notes: "~14g protein — low sodium ✅" },
        { name: "Homemade gravy (~½ cup, onion broth base)", kcal: 60, notes: "~2g protein" },
        { name: "Lindt salted caramel bunny ears (~20g)", kcal: 110, notes: "~1g protein" },
        { name: "Cadbury choc eggs × 2 small (foil, not cream)", kcal: 90, notes: "~1g protein" },
        { name: "Chardonnay (~8 sips, ~2oz)", kcal: 50 },
      ]},
      { id: "m3", time: "Evening", label: "Gouda Toast + Chorizo + Potatoes + Salad 🥗", protein_highlight: true, items: [
        { name: "Sourdough toast × 2 thick slices", kcal: 200, notes: "~5g protein" },
        { name: "Smoked Gouda (~1.5oz, ¾ coverage 2mm slices)", kcal: 155, notes: "~10g protein" },
        { name: "Powdered + shredded parmesan", kcal: 40, notes: "~4g protein" },
        { name: "Simple Truth chorizo × ½ sausage", kcal: 115, notes: "~13g protein ⚠️ ~255mg sodium" },
        { name: "Roasted potato wedges × 3–4 (purple + regular)", kcal: 120, notes: "~3g protein" },
        { name: "Extra: 1 tomato + 2 more potato wedges", kcal: 50, notes: "~1g protein" },
        { name: "Salad — diced tomatoes + romaine + spinach", kcal: 60, notes: "~2g protein ✅" },
        { name: "Reese's PB egg (individual)", kcal: 170, notes: "~4g protein" },
      ]},
    ],
    health: { steps: 7568, active_kcal: 484, basal_kcal: 1091, rhr: 56, sleep_hours: 7.2, sodium_mg: 1900, sleep_note: "~12:20 AM → 7:31 AM AKDT. 7.2h — great recovery sleep. RHR back to 56 ✅", notes: "92g protein ✅. Clean sodium day after two 3,800mg days. Dr. Shobha session 6:30 PM." }
  },
  "2026-04-07": {
    label: "Tuesday — Dr. Shobha 6:30 PM",
    meals: [
      { id: "m1", time: "Morning/Afternoon", label: "Chai Latte + Bar + Donut ☕", protein_highlight: true, items: [
        { name: "North Pole Coffee vanilla chai latte (20oz)", kcal: 280, notes: "~6g protein" },
        { name: "Kirkland protein bar (10g protein)", kcal: 190, notes: "~10g protein" },
        { name: "Half Boston cream chocolate glazed donut", kcal: 150, notes: "~2g protein" },
      ]},
      { id: "m2", time: "Pre-ski", label: "Tofu Bunny + Domino's + Gouda 🎿", protein_highlight: true, items: [
        { name: "Tofu bunny slice (~170g, ¾\" thick tapering) + gravy (~¼ cup)", kcal: 160, notes: "~14g protein ✅ low sodium" },
        { name: "Domino's handmade pan slice + Gouda (~1oz melted)", kcal: 420, notes: "~18g protein ⚠️ sodium" },
        { name: "1 tomato + 1/6 garlic dipping cup", kcal: 50, notes: "~1g protein" },
      ], note: "Pre-ski fuel ✅" },
      { id: "m3", time: "Post-ski", label: "Yogurt Bowl + Chocolate 🥛", protein_highlight: true, items: [
        { name: "Greek yogurt (~1.1 cups)", kcal: 185, notes: "~19g protein" },
        { name: "Mixed nuts (~2.5 dozen — almonds, walnuts, pecans)", kcal: 210, notes: "~7g protein" },
        { name: "Granola (~½ cup)", kcal: 200, notes: "~5g protein" },
        { name: "Honey (~¾ tbsp)", kcal: 45 },
        { name: "Cadbury mini milk choc eggs × 4", kcal: 80, notes: "~1g protein" },
        { name: "Reese's small individual egg", kcal: 170, notes: "~4g protein" },
      ]},
    ],
    health: { steps: 12842, active_kcal: 950, basal_kcal: 1492, rhr: 53, sleep_hours: 6.9, sodium_mg: 1200, sleep_note: "~11:37 PM → 6:32 AM AKDT. 6.9h ✅. RHR 53 bpm 🫀", notes: "Skiing ✅ 12,842 steps. ~302 kcal deficit. ~85g protein ✅. Clean sodium day." }
  },
  "2026-04-08": {
    label: "Wednesday — Band Practice 6 PM 🎵",
    meals: [
      { id: "m1", time: "Afternoon", label: "Caprese + Mozz Roll + Yogurt 🥛", protein_highlight: true, items: [
        { name: "Sourdough dinner roll + melted mozzarella (~1.5oz)", kcal: 280, notes: "~12g protein" },
        { name: "Caprese bowl: 2 tomatoes + fresh mozz (~2oz) + basil + olive oil", kcal: 250, notes: "~10g protein" },
        { name: "Greek yogurt (~1.1 cups) + granola (~¼ cup) + ¼ tsp honey", kcal: 311, notes: "~22g protein" },
        { name: "Extra spoons caprese", kcal: 50, notes: "~2g protein" },
        { name: "Chocolate chip cookies × 1.5 (medium-large)", kcal: 240, notes: "~3g protein" },
      ]},
      { id: "m2", time: "Throughout", label: "Toast + Cookie + PB + Bar 🥜", protein_highlight: true, items: [
        { name: "Sourdough toast × 1 + trace butter", kcal: 85, notes: "~3g protein" },
        { name: "Homemade oat choc chip cookie (standard piece)", kcal: 160, notes: "~3g protein" },
        { name: "Peanut butter (2.15 tbsp) + peanuts", kcal: 215, notes: "~9g protein" },
        { name: "Kirkland protein bar (10g protein)", kcal: 190, notes: "~10g protein" },
      ]},
      { id: "m3", time: "Evening", label: "Cake 🎂", items: [
        { name: "Half slice homemade cake (½ whole wheat + ½ white flour, vanilla pudding cream cheese frosting)", kcal: 230, notes: "~3g protein" },
      ]},
    ],
    health: { steps: 10599, active_kcal: 655, basal_kcal: 1412, rhr: 56, sleep_hours: 6.9, sodium_mg: 500, sleep_note: "~11:54 PM → 6:50 AM AKDT. 6.9h ✅.", notes: "Band Practice 6–9 PM ✅. Brighton Brooks tomorrow 3 PM." }
  }
};

const MEAL_COLORS = ["#eef6fb","#f3f0fc","#f0faf2","#fdf8ee","#f5f5f5","#fdecea"];
const MEAL_ACCENTS = ["#2e86ab","#7059bf","#3da35d","#d4a017","#888","#d95d39"];

const SODIUM_DATA = {
  "2026-03-22": { mg: 1800, status: "ok" },
  "2026-03-23": { mg: 2600, status: "warn" },
  "2026-03-24": { mg: 3200, status: "high" },
  "2026-03-25": { mg: 2400, status: "warn" },
  "2026-03-26": { mg: 3500, status: "high" },
  "2026-03-27": { mg: 2800, status: "warn" },
  "2026-03-28": { mg: 2100, status: "ok" },
  "2026-03-29": { mg: 3800, status: "high" },
  "2026-03-30": { mg: 1800, status: "ok" },
  "2026-03-31": { mg: 2800, status: "warn" },
  "2026-04-01": { mg: 2400, status: "warn" },
  "2026-04-02": { mg: 700, status: "ok" },
  "2026-04-03": { mg: 650, status: "ok" },
  "2026-04-04": { mg: 3300, status: "high" },
  "2026-04-05": { mg: 3800, status: "high" },
  "2026-04-06": { mg: 1900, status: "ok" },
  "2026-04-07": { mg: 1200, status: "ok" },
  "2026-04-08": { mg: 500, status: "ok" },
};

const sodiumColor = (s) => s === "ok" ? "#81c784" : s === "warn" ? "#ffb74d" : "#ef5350";
const sodiumLabel = (s) => s === "ok" ? "✅ OK" : s === "warn" ? "⚠️ Over" : "🔴 High";

function formatDate(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function calcTotal(meals) {
  return meals.reduce((s, m) => s + m.items.reduce((ss, i) => ss + (i.kcal || 0), 0), 0);
}
function calcProtein(meals) {
  let t = 0;
  meals.forEach(m => m.items.forEach(i => {
    if (i.notes) { const x = i.notes.match(/~?(\d+(?:\.\d+)?)g protein/); if (x) t += parseFloat(x[1]); }
  }));
  return Math.round(t);
}
function getTotalBurn(h) {
  if (h.active_kcal && h.basal_kcal) return Math.round(h.active_kcal + h.basal_kcal);
  return 2700;
}

function MealCard({ meal, accent, bg }) {
  const total = meal.items.reduce((s, i) => s + (i.kcal || 0), 0);
  return (
    <div style={{ background: bg, borderRadius: 14, padding: "16px 18px", marginBottom: 12, borderLeft: `4px solid ${accent}`, boxShadow: meal.protein_highlight ? `0 0 0 2px ${accent}44` : "0 2px 8px rgba(0,0,0,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div>
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 14, color: "#1a1a2e" }}>{meal.label}</span>
          <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>{meal.time}</span>
        </div>
        <span style={{ fontWeight: 800, fontSize: 15, color: accent }}>{total} kcal</span>
      </div>
      {meal.items.map((item, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#444", padding: "4px 0", borderBottom: i < meal.items.length - 1 ? "1px dashed #e0e0e0" : "none" }}>
          <span style={{ maxWidth: "78%", lineHeight: 1.4 }}>
            {item.name}
            {item.notes && <span style={{ color: item.notes.includes("protein") ? "#3da35d" : "#bbb", fontSize: 11, marginLeft: 5 }}>({item.notes})</span>}
          </span>
          <span style={{ fontWeight: 600, color: "#666", marginLeft: 8 }}>{item.kcal}</span>
        </div>
      ))}
      {meal.note && <div style={{ marginTop: 8, fontSize: 11, color: "#c8a24a", fontStyle: "italic" }}>{meal.note}</div>}
    </div>
  );
}

function DayView({ date, data }) {
  const totalIntake = calcTotal(data.meals);
  const protein = calcProtein(data.meals);
  const totalBurn = getTotalBurn(data.health);
  const deficit = totalBurn - totalIntake;
  const isToday = date === "2026-04-08";
  const sodium = SODIUM_DATA[date];
  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#0f1f35 0%,#1e3a5f 100%)", borderRadius: 18, padding: "20px 22px", marginBottom: 18, color: "white" }}>
        <div style={{ fontSize: 10, opacity: 0.5, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>{data.label}</div>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{formatDate(date)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[
            { label: isToday ? "Intake so far" : "Intake", value: totalIntake, color: "#f4a261" },
            { label: data.health.active_kcal && data.health.basal_kcal ? "Total burn" : "TDEE est.", value: totalBurn, color: "#64b5f6" },
            { label: deficit >= 0 ? "Deficit ✓" : "Surplus", value: Math.abs(deficit), color: deficit >= 0 ? "#81c784" : "#ef9a9a" },
          ].map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.09)", borderRadius: 12, padding: "11px 12px" }}>
              <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value.toLocaleString()}</div>
              <div style={{ fontSize: 10, opacity: 0.5 }}>kcal</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {protein > 0 && (
            <div style={{ background: protein >= 120 ? "rgba(61,163,93,0.35)" : "rgba(61,163,93,0.2)", borderRadius: 10, padding: "9px 13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#81c784" }}>💪 Protein</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#81c784" }}>{protein}g<span style={{ fontSize: 10, opacity: 0.7 }}>/130g</span>{protein >= 130 ? " 🎯" : ""}</span>
            </div>
          )}
          {sodium && (
            <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: "9px 13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, opacity: 0.7 }}>🧂 Sodium</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: sodiumColor(sodium.status) }}>{sodium.mg.toLocaleString()}mg {sodiumLabel(sodium.status)}</span>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {[
            { l: "Steps", v: data.health.steps ? data.health.steps.toLocaleString() : "—" },
            { l: "Active", v: data.health.active_kcal ? `${Math.round(data.health.active_kcal)}` : "—" },
            { l: "RHR", v: data.health.rhr ? `${data.health.rhr} bpm` : "—" },
            { l: "Sleep", v: data.health.sleep_hours ? `${data.health.sleep_hours}h` : "—" },
          ].map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 9, padding: "9px 10px" }}>
              <div style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{s.l}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{s.v}</div>
            </div>
          ))}
        </div>
        {data.health.notes && <div style={{ marginTop: 11, fontSize: 11, opacity: 0.6, lineHeight: 1.5 }}>🏃 {data.health.notes}</div>}
        {data.health.sleep_note && <div style={{ marginTop: 6, fontSize: 11, opacity: 0.5, fontStyle: "italic", lineHeight: 1.5 }}>💤 {data.health.sleep_note}</div>}
      </div>
      {data.meals.map((meal, i) => (
        <MealCard key={meal.id} meal={meal} accent={MEAL_ACCENTS[i % MEAL_ACCENTS.length]} bg={MEAL_COLORS[i % MEAL_COLORS.length]} />
      ))}
    </div>
  );
}

function WeekSummary({ log }) {
  const dates = Object.keys(log).sort();
  const intakes = dates.map(d => calcTotal(log[d].meals));
  const burns = dates.map(d => getTotalBurn(log[d].health));
  const proteins = dates.map(d => calcProtein(log[d].meals));
  const steps = dates.map(d => log[d].health.steps || 0);
  const avgI = Math.round(intakes.reduce((a,b)=>a+b,0)/dates.length);
  const avgB = Math.round(burns.reduce((a,b)=>a+b,0)/dates.length);
  const avgP = Math.round(proteins.reduce((a,b)=>a+b,0)/dates.length);
  const avgNa = Math.round(dates.reduce((s,d) => s + (SODIUM_DATA[d]?.mg || 0), 0) / dates.length);
  const avgSteps = Math.round(steps.reduce((a,b)=>a+b,0)/dates.length);
  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#0f1f35 0%,#1e3a5f 100%)", borderRadius: 18, padding: "20px 22px", marginBottom: 18, color: "white" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>18-Day Overview</div>
        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 16 }}>Mar 22 – Apr 8 · Apple Health · Yogurt corrected ✅</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[
            { label: "Avg intake", value: avgI, color: "#f4a261" },
            { label: "Avg burn", value: avgB, color: "#64b5f6" },
            { label: avgB > avgI ? "Avg deficit" : "Avg surplus", value: Math.abs(avgB-avgI), color: avgB > avgI ? "#81c784" : "#ef9a9a" },
          ].map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.09)", borderRadius: 12, padding: "11px 12px" }}>
              <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value.toLocaleString()}</div>
              <div style={{ fontSize: 10, opacity: 0.5 }}>kcal/day</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div style={{ background: "rgba(61,163,93,0.2)", borderRadius: 10, padding: "9px 13px" }}>
            <div style={{ fontSize: 10, color: "#81c784", marginBottom: 2 }}>💪 Avg protein</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#81c784" }}>{avgP}g<span style={{ fontSize: 10, opacity: 0.7 }}>/130g</span></div>
          </div>
          <div style={{ background: avgNa > 2300 ? "rgba(239,83,80,0.2)" : "rgba(61,163,93,0.2)", borderRadius: 10, padding: "9px 13px" }}>
            <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 2, color: avgNa > 2300 ? "#ef9a9a" : "#81c784" }}>🧂 Avg sodium</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: avgNa > 2300 ? "#ef9a9a" : "#81c784" }}>{avgNa.toLocaleString()}<span style={{ fontSize: 10, opacity: 0.7 }}>mg</span></div>
          </div>
          <div style={{ background: "rgba(100,181,246,0.2)", borderRadius: 10, padding: "9px 13px" }}>
            <div style={{ fontSize: 10, color: "#64b5f6", marginBottom: 2 }}>👟 Avg steps</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#64b5f6" }}>{avgSteps.toLocaleString()}</div>
          </div>
        </div>
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", border: "1px solid #e8e8e8", marginBottom: 14 }}>
        <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 13, color: "#1a1a2e", marginBottom: 10 }}>🧂 Sodium by day <span style={{ fontSize: 11, color: "#aaa", fontWeight: 400 }}>(limit: 2,300mg)</span></div>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>Main culprits: Smart Dogs (480mg each), Costco pizza (~1,300mg), UAF calzones (~1,200mg), chorizo (510mg).</div>
        {dates.map((d) => {
          const na = SODIUM_DATA[d];
          return (
            <div key={d} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 2 }}>
                <span>{new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span>
                <span style={{ color: sodiumColor(na.status), fontWeight: 700 }}>{na.mg.toLocaleString()}mg {sodiumLabel(na.status)}</span>
              </div>
              <div style={{ background: "#f0f0f0", borderRadius: 4, height: 6 }}>
                <div style={{ width: `${Math.min((na.mg/2300)*100, 100)}%`, background: sodiumColor(na.status), borderRadius: 4, height: 6 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", border: "1px solid #e8e8e8", marginBottom: 14 }}>
        <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 13, color: "#1a1a2e", marginBottom: 10 }}>⚠️ Watch & track</div>
        {[
          { icon: "🥛", label: "Yogurt calibration", note: "1/5–1/6 of 48oz Costco = ~1–1.2 cups. All days corrected ✅", color: "#81c784" },
          { icon: "🧂", label: "Sodium", note: "Avg over limit. Key rule: don't stack Smart Dogs + calzone + Costco pizza same day.", color: "#ef9a9a" },
          { icon: "🍬", label: "Sugar", note: "High on treat days. Swap one evening sweet for banana or berries.", color: "#ffb74d" },
          { icon: "🩸", label: "Iron + zinc + ferritin", note: "Blood panel pending — schedule it.", color: "#ef9a9a" },
          { icon: "☀️", label: "Vitamin D", note: "Alaska in April = very likely low. Add supplement.", color: "#ffb74d" },
          { icon: "💪", label: "Protein", note: "Corrected avg ~85g/day — massive improvement from 40–60g baseline ✅", color: "#81c784" },
          { icon: "🏋️", label: "Resistance training", note: "Add 2× SRC sessions/week for muscle growth.", color: "#64b5f6" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: i < 6 ? "1px dashed #f0f0f0" : "none" }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: item.color }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{item.note}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", border: "1px solid #e8e8e8" }}>
        <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 13, color: "#1a1a2e", marginBottom: 10 }}>Daily log</div>
        {dates.map((d, i) => {
          const diff = burns[i] - intakes[i];
          return (
            <div key={d} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < dates.length-1 ? "1px dashed #f0f0f0" : "none" }}>
              <span style={{ fontSize: 11, color: "#666", minWidth: 80 }}>{new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span>
              <span style={{ fontSize: 11, color: "#3da35d", fontWeight: 600, minWidth: 45 }}>{proteins[i]}g 💪</span>
              <span style={{ fontSize: 11, color: "#999", minWidth: 65 }}>{intakes[i].toLocaleString()} in</span>
              <span style={{ fontSize: 11, color: "#64b5f6", minWidth: 65 }}>{burns[i].toLocaleString()} burn</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: diff >= 0 ? "#3da35d" : "#d95d39" }}>
                {diff >= 0 ? `−${diff}` : `+${Math.abs(diff)}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FoodLog() {
  const [log, setLog] = useState(null);
  const [activeDate, setActiveDate] = useState("2026-04-08");
  const [loaded, setLoaded] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await window.storage.get(STORAGE_KEY);
        if (stored?.value) {
          const parsed = JSON.parse(stored.value);
          const merged = { ...initialLog, ...parsed };
          setLog(merged);
          setActiveDate(Object.keys(merged).sort().reverse()[0]);
        } else {
          setLog(initialLog);
          await window.storage.set(STORAGE_KEY, JSON.stringify(initialLog));
        }
      } catch {
        setLog(initialLog);
        try { await window.storage.set(STORAGE_KEY, JSON.stringify(initialLog)); } catch {}
      }
      setLoaded(true);
    })();
  }, []);

  const dates = log ? Object.keys(log).sort().reverse() : [];
  if (!loaded) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:200, color:"#aaa", fontFamily:"Georgia, serif" }}>Loading…</div>;

  return (
    <div style={{ maxWidth:600, margin:"0 auto", padding:"24px 16px 48px", fontFamily:"Georgia, serif", background:"#f7f7f5", minHeight:"100vh" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, letterSpacing:3, color:"#bbb", textTransform:"uppercase", marginBottom:2 }}>Nikhil · Personal Health</div>
        <h1 style={{ fontSize:23, fontWeight:800, margin:0, color:"#0f1f35", letterSpacing:-0.5 }}>Food & Activity Log</h1>
        <p style={{ fontSize:12, color:"#bbb", margin:"4px 0 0", fontStyle:"italic" }}>Mar 22 – Apr 8 · Apple Health · Yogurt corrected ✅</p>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:18, overflowX:"auto", paddingBottom:4 }}>
        {dates.map(d => (
          <button key={d} onClick={() => { setActiveDate(d); setShowSummary(false); }} style={{
            padding:"7px 15px", borderRadius:20, border:"none",
            background: d===activeDate && !showSummary ? "#0f1f35" : "#e4e4e0",
            color: d===activeDate && !showSummary ? "white" : "#666",
            fontFamily:"Georgia, serif", fontSize:12.5, cursor:"pointer",
            whiteSpace:"nowrap", fontWeight: d===activeDate && !showSummary ? 700 : 400
          }}>{new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</button>
        ))}
        <button onClick={() => setShowSummary(true)} style={{
          padding:"7px 15px", borderRadius:20, border:"none",
          background: showSummary ? "#3da35d" : "#e4e4e0",
          color: showSummary ? "white" : "#666",
          fontFamily:"Georgia, serif", fontSize:12.5, cursor:"pointer", whiteSpace:"nowrap"
        }}>📊 Avg</button>
      </div>
      {showSummary ? <WeekSummary log={log} /> : log?.[activeDate] && <DayView date={activeDate} data={log[activeDate]} />}
      <div style={{ marginTop:32, textAlign:"center", fontSize:10, color:"#ccc", letterSpacing:2, textTransform:"uppercase" }}>
        Raven Claw Engineering · Health Log v1
      </div>
    </div>
  );
}
