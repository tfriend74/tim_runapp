// ─────────────────────────────────────────────────────────────────────────────
// data.js  —  All run data lives here. Update this file when you want fresh
//             stats, then redeploy to Vercel (or hit the Update button in-app).
// ─────────────────────────────────────────────────────────────────────────────

export const YTD_MILES = 41.4;
export const LAST_UPDATED = "Apr 12, 2026";

// Most recent 7 runs  { date, dayFull, distance (m), duration (s), calories }
export const recentRuns = [
  { date: "Apr 12", dayFull: "Sunday, Apr 12, 2026",   distance: 5153, duration: 1744, calories: 404 },
  { date: "Apr 10", dayFull: "Thursday, Apr 10, 2026", distance: 7271, duration: 2760, calories: 574 },
  { date: "Apr 7",  dayFull: "Monday, Apr 7, 2026",    distance: 4850, duration: 1763, calories: 380 },
  { date: "Apr 5",  dayFull: "Saturday, Apr 5, 2026",  distance: 3240, duration: 989,  calories: 260 },
  { date: "Apr 4",  dayFull: "Friday, Apr 4, 2026",    distance: 4879, duration: 1847, calories: 388 },
  { date: "Mar 31", dayFull: "Monday, Mar 31, 2026",   distance: 4863, duration: 1860, calories: 392 },
  { date: "Mar 22", dayFull: "Sunday, Mar 22, 2026",   distance: 5139, duration: 2481, calories: 390 },
];

// Last 7 calendar days  { date, miles, hr (avg bpm), hasRun }
export const last7Days = [
  { date: "Apr 5",  miles: 6.51, hr: 108, hasRun: true  },
  { date: "Apr 6",  miles: 2.86, hr: 81,  hasRun: false },
  { date: "Apr 7",  miles: 5.25, hr: 100, hasRun: true  },
  { date: "Apr 8",  miles: 2.70, hr: 82,  hasRun: false },
  { date: "Apr 9",  miles: 2.44, hr: 80,  hasRun: false },
  { date: "Apr 10", miles: 5.67, hr: 114, hasRun: true  },
  { date: "Apr 12", miles: 3.20, hr: 89,  hasRun: true  },
];

// Pace history across all 2026 runs  { date, pace (min/mile float) }
export const speedData = [
  { date: "Feb 8",  pace: 10.23 },
  { date: "Mar 1",  pace: 10.09 },
  { date: "Mar 13", pace: 10.56 },
  { date: "Mar 15", pace:  9.72 },
  { date: "Mar 17", pace: 10.33 },
  { date: "Mar 20", pace: 10.19 },
  { date: "Mar 22", pace: 12.57 },
  { date: "Mar 31", pace: 10.09 },
  { date: "Apr 4",  pace: 10.09 },
  { date: "Apr 5",  pace:  8.11 },
  { date: "Apr 7",  pace:  9.45 },
  { date: "Apr 10", pace: 10.11 },
  { date: "Apr 12", pace:  9.05 },
];

// Weekly distance (walk + run combined)
export const weeklyData = [
  { week: "Jan W1", miles: 16.10 },
  { week: "Jan W2", miles: 18.06 },
  { week: "Jan W3", miles: 15.14 },
  { week: "Jan W4", miles: 15.74 },
  { week: "Feb W1", miles: 15.35 },
  { week: "Feb W2", miles: 17.85 },
  { week: "Feb W3", miles: 14.42 },
  { week: "Feb W4", miles: 17.23 },
  { week: "Mar W1", miles: 14.49 },
  { week: "Mar W2", miles:  8.36 },
  { week: "Mar W3", miles: 24.71 },
  { week: "Mar W4", miles: 21.29 },
  { week: "Apr W1", miles: 17.09 },
  { week: "Apr W2", miles: 27.18 },
];

// Monthly run totals (tracked run workouts only)
export const monthlyData = [
  { month: "Jan", miles:  0.00, runs: 0 },
  { month: "Feb", miles:  3.06, runs: 1 },
  { month: "Mar", miles: 22.63, runs: 4 },  // 4 runs tracked in HealthKit
  { month: "Apr", miles: 27.18, runs: 8 },  // through Apr 12
];

// 2026 Personal Records
export const prs = [
  { label: "Longest Run",     value: "4.52 mi",  date: "Apr 10, 2026", note: "7,271 m" },
  { label: "Fastest Pace",    value: "8:11 /mi", date: "Apr 5, 2026",  note: "2.01 mi run" },
  { label: "Most Calories",   value: "574 kcal", date: "Apr 10, 2026", note: "4.52 mi run" },
  { label: "Best Resting HR", value: "71 bpm",   date: "Apr 2026",     note: "Monthly avg resting HR" },
];

// Heart rate — monthly averages
export const hrMonthly = [
  { month: "Jan", avg: 87, resting: 73 },
  { month: "Feb", avg: 90, resting: 76 },
  { month: "Mar", avg: 95, resting: 74 },
  { month: "Apr", avg: 93, resting: 71 },
];

// Heart rate — daily samples
export const hrDaily = [
  { date: "Jan 3",  hr: 85  }, { date: "Jan 7",  hr: 106 }, { date: "Jan 11", hr: 81  },
  { date: "Jan 15", hr: 86  }, { date: "Jan 20", hr: 88  }, { date: "Jan 23", hr: 76  },
  { date: "Feb 1",  hr: 73  }, { date: "Feb 9",  hr: 122 }, { date: "Feb 12", hr: 80  },
  { date: "Feb 20", hr: 86  }, { date: "Feb 23", hr: 95  }, { date: "Feb 27", hr: 91  },
  { date: "Mar 2",  hr: 131 }, { date: "Mar 14", hr: 103 }, { date: "Mar 16", hr: 112 },
  { date: "Mar 21", hr: 135 }, { date: "Mar 23", hr: 121 }, { date: "Mar 27", hr: 82  },
  { date: "Apr 4",  hr: 138 }, { date: "Apr 6",  hr: 108 }, { date: "Apr 8",  hr: 100 },
  { date: "Apr 10", hr: 114 }, { date: "Apr 12", hr: 89  },
];
