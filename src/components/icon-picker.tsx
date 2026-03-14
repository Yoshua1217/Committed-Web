"use client";

import MaterialIcon from "@/components/material-icon";
import { getAllIcons } from "@/lib/icons";

interface IconPickerProps {
  selectedIcon: string;
  onSelectIcon: (iconName: string) => void;
  accentColor?: string;
}

const iconGroups: { label: string; icons: string[] }[] = [
  {
    label: "Strength",
    icons: ["FitnessCenter", "Whatshot", "Bolt", "Shield", "Star", "RocketLaunch", "DirectionsRun"],
  },
  {
    label: "Mind",
    icons: ["Psychology", "MenuBook", "School", "Lightbulb", "Architecture", "Code"],
  },
  {
    label: "Faith",
    icons: ["Church", "Mosque", "SelfImprovement", "VolunteerActivism", "Spa", "AutoAwesome"],
  },
  {
    label: "Tools",
    icons: ["Handyman", "Build", "Construction", "Engineering", "Terminal", "WorkspacePremium"],
  },
  {
    label: "Life",
    icons: ["Home", "Work", "People", "AttachMoney", "LocalHospital", "Schedule", "Restaurant", "Pets"],
  },
  {
    label: "Nature",
    icons: ["Park", "Terrain", "WbSunny", "Nightlife"],
  },
  {
    label: "Goals",
    icons: ["Category", "Flag", "EmojiEvents", "TrendingUp", "Explore", "Language"],
  },
  {
    label: "Creative",
    icons: ["MusicNote", "Brush", "CameraAlt", "Palette", "SportsEsports"],
  },
];

export default function IconPicker({ selectedIcon, onSelectIcon, accentColor }: IconPickerProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {iconGroups.map((group) => (
        <div key={group.label}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            {group.label}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {group.icons.map((iconName) => {
              const isSelected = selectedIcon === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  title={iconName}
                  onClick={() => onSelectIcon(iconName)}
                  style={{
                    width: 44,
                    height: 44,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    border: isSelected
                      ? `2px solid ${accentColor || "var(--primary)"}`
                      : "1px solid var(--border)",
                    background: isSelected
                      ? (accentColor ? accentColor + "20" : "var(--surface-variant)")
                      : "var(--surface)",
                    color: isSelected
                      ? (accentColor || "var(--primary)")
                      : "var(--secondary)",
                    cursor: "pointer",
                    padding: 0,
                    transition: "all 0.15s",
                  }}
                >
                  <MaterialIcon name={iconName} size={22} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
