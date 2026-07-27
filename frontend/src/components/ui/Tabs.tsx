import type { CSSProperties } from "react";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

interface Tab {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

const containerStyle: CSSProperties = {
  display: "flex",
  gap: "4px",
  borderBottom: `2px solid ${colors.lightGray}`,
  marginBottom: "16px",
};

function getTabStyle(isActive: boolean): CSSProperties {
  return {
    padding: "10px 20px",
    fontSize: fontSizes.body,
    fontFamily,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? colors.green : colors.darkGray,
    backgroundColor: "transparent",
    border: "none",
    borderBottom: isActive ? `2px solid ${colors.green}` : "2px solid transparent",
    marginBottom: "-2px",
    cursor: "pointer",
    borderRadius: `${borderRadius.card} ${borderRadius.card} 0 0`,
    transition: "color 0.2s ease, border-color 0.2s ease",
  };
}

export default function Tabs({ tabs, activeTab, onTabChange }: TabsProps) {
  return (
    <div style={containerStyle} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === activeTab}
          style={getTabStyle(tab.key === activeTab)}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
