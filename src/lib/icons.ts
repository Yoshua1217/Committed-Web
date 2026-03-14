/**
 * Maps Android Material Icon PascalCase names to Google Material Symbols snake_case names.
 * These are the 48 curated icons from the Android app's IconPicker.
 */
const iconNameMap: Record<string, string> = {
  // Strength & Power
  FitnessCenter: "fitness_center",
  Whatshot: "whatshot",
  Bolt: "bolt",
  Shield: "shield",
  Star: "star",
  RocketLaunch: "rocket_launch",
  // Mind & Knowledge
  Psychology: "psychology",
  MenuBook: "menu_book",
  School: "school",
  Lightbulb: "lightbulb",
  Architecture: "architecture",
  Code: "code",
  // Faith & Spiritual
  Church: "church",
  Mosque: "mosque",
  SelfImprovement: "self_improvement",
  VolunteerActivism: "volunteer_activism",
  Spa: "spa",
  AutoAwesome: "auto_awesome",
  // Tools & Work
  Handyman: "handyman",
  Build: "build",
  Construction: "construction",
  Engineering: "engineering",
  Terminal: "terminal",
  WorkspacePremium: "workspace_premium",
  // General Life
  Home: "home",
  Work: "work",
  People: "people",
  AttachMoney: "attach_money",
  LocalHospital: "local_hospital",
  Schedule: "schedule",
  Restaurant: "restaurant",
  Pets: "pets",
  // Nature & Outdoors
  Park: "park",
  Terrain: "terrain",
  WbSunny: "wb_sunny",
  Nightlife: "nightlife",
  // Life & Goals
  Category: "category",
  Flag: "flag",
  EmojiEvents: "emoji_events",
  TrendingUp: "trending_up",
  Explore: "explore",
  Language: "language",
  // Creative & Fun
  MusicNote: "music_note",
  Brush: "brush",
  CameraAlt: "camera_alt",
  Palette: "palette",
  SportsEsports: "sports_esports",
  DirectionsRun: "directions_run",
};

/**
 * Convert an Android PascalCase icon name to a Material Symbols name.
 * Falls back to "category" (the default icon in the Android app).
 */
export function resolveIconName(androidName: string): string {
  if (iconNameMap[androidName]) return iconNameMap[androidName];
  // If the string is already a snake_case material symbol, return it directly
  if (/^[a-z_]+$/.test(androidName)) return androidName;
  return "category";
}

/**
 * Get all available icon entries for icon pickers.
 */
export function getAllIcons(): { androidName: string; symbolName: string }[] {
  return Object.entries(iconNameMap).map(([androidName, symbolName]) => ({
    androidName,
    symbolName,
  }));
}
