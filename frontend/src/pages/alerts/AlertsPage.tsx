import { useMemo, type CSSProperties } from "react";
import { useAlerts } from "../../hooks/useAnalytics";
import { useZones } from "../../hooks/useZones";
import StatusBadge from "../../components/ui/StatusBadge";
import EmptyState from "../../components/ui/EmptyState";
import { PRIORITY_COLORS } from "../../constants/priority";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

export default function AlertsPage() {
  const { alerts, isLoading, error } = useAlerts();
  const { zones } = useZones();

  // Build a zone lookup map for resolving zoneId -> zone name
  const zoneMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const zone of zones) {
      map[zone.id] = zone.name;
    }
    return map;
  }, [zones]);

  // Sort alerts by creation date descending (most recent first)
  const sortedAlerts = useMemo(() => {
    return [...alerts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [alerts]);

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Styles
  const pageStyle: CSSProperties = {
    padding: "32px",
    fontFamily,
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  };

  const headingStyle: CSSProperties = {
    fontSize: fontSizes.pageHeading,
    fontWeight: 600,
    color: colors.black,
    fontFamily,
    margin: 0,
  };

  const loadingStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    padding: "16px 0",
  };

  const errorStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.red,
    padding: "16px 0",
  };

  const listStyle: CSSProperties = {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  };

  const alertCardStyle: CSSProperties = {
    padding: "16px 20px",
    borderRadius: borderRadius.card,
    backgroundColor: colors.white,
    border: `1px solid ${colors.darkGray}`,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  const alertTopRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  };

  const alertMessageStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    fontWeight: 500,
    margin: 0,
  };

  const alertMetaStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    fontFamily,
    fontSize: "12px",
    color: colors.darkGray,
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={headingStyle}>Alerts</h1>
      </div>

      {isLoading && <p style={loadingStyle}>Loading alerts...</p>}

      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}

      {!isLoading && !error && sortedAlerts.length === 0 && (
        <EmptyState message="No critical alerts at this time." />
      )}

      {!isLoading && !error && sortedAlerts.length > 0 && (
        <ul style={listStyle}>
          {sortedAlerts.map((alert) => (
            <li key={alert.id} style={alertCardStyle}>
              <div style={alertTopRowStyle}>
                <StatusBadge value={alert.priority} colorMap={PRIORITY_COLORS} />
                <p style={alertMessageStyle}>{alert.message}</p>
              </div>
              <div style={alertMetaStyle}>
                <span>{zoneMap[alert.zoneId] ?? "Unknown Zone"}</span>
                <span>{formatDate(alert.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
