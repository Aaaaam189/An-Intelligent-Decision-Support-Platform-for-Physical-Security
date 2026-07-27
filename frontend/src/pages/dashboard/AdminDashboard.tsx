import { useMemo, useState, type CSSProperties } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  useAnalyticsSummary,
  useAnalyticsToday,
  useAnalyticsAlerts,
} from "../../hooks/useAnalytics";
import { useIncidents } from "../../hooks/useIncidents";
import { useUsers } from "../../hooks/useUsers";
import { useCameras } from "../../hooks/useCameras";
import { useShifts } from "../../hooks/useShifts";
import { useZones } from "../../hooks/useZones";
import { useNotifications } from "../../hooks/useNotifications";
import SummaryWidget from "../../components/dashboard/SummaryWidget";
import {
  colors,
  fontFamily,
  fontSizes,
  borderRadius,
  fontFamilyHeading,
} from "../../constants/theme";
import type { CriticalAlert } from "../../types/analytics.types";

// ─── Color Maps ───────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "#4CAF50",
  MEDIUM: "#FF9800",
  HIGH: "#F44336",
  CRITICAL: "#9C27B0",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#FF9800",
  IN_PROGRESS: "#2196F3",
  RESOLVED: "#4CAF50",
  CLOSED: "#9E9E9E",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const pageStyle: CSSProperties = {
  padding: "32px",
  fontFamily,
  minHeight: "100vh",
};

const headingStyle: CSSProperties = {
  fontSize: fontSizes.pageHeading,
  fontWeight: 700,
  marginBottom: "24px",
  color: colors.black,
  fontFamily: fontFamilyHeading,
};

const widgetsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "16px",
  marginBottom: "24px",
};

const chartsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: "24px",
  marginBottom: "24px",
};

const chartCardStyle: CSSProperties = {
  backgroundColor: colors.white,
  borderRadius: borderRadius.card,
  padding: "20px",
  border: `1px solid ${colors.lightGray}`,
};

const chartTitleStyle: CSSProperties = {
  fontSize: fontSizes.sectionHeading,
  fontWeight: 600,
  color: colors.black,
  marginBottom: "16px",
  fontFamily,
};

const loadingStyle: CSSProperties = {
  fontSize: fontSizes.body,
  color: colors.darkGray,
  padding: "24px 0",
};

const errorBannerStyle: CSSProperties = {
  fontSize: fontSizes.body,
  color: "#856404",
  backgroundColor: "#fff3cd",
  border: "1px solid #ffc107",
  borderRadius: borderRadius.card,
  padding: "12px 16px",
  marginBottom: "16px",
};

const sectionStyle: CSSProperties = {
  marginBottom: "24px",
};

const notificationBannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  backgroundColor: "#e3f2fd",
  border: "1px solid #90caf9",
  borderRadius: borderRadius.card,
  marginBottom: "16px",
  fontSize: fontSizes.body,
  fontFamily,
};

const dismissBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "18px",
  color: "#1565c0",
  fontWeight: 700,
  lineHeight: 1,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: fontSizes.body,
  fontFamily,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: `2px solid ${colors.lightGray}`,
  color: colors.black,
  fontWeight: 600,
};

const tdStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: `1px solid ${colors.lightGray}`,
  color: colors.black,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

function formatMinutes(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const mins = Math.round(seconds / 60);
  return `${mins}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  // Data hooks
  const { summary, isLoading: analyticsLoading, error: analyticsError } = useAnalyticsSummary();
  const { incidentsToday, isLoading: todayLoading, error: todayError } = useAnalyticsToday();
  const { alerts, isLoading: alertsLoading, error: alertsError } = useAnalyticsAlerts();
  const { incidents, isLoading: incidentsLoading, error: incidentsError } = useIncidents();
  const { users, isLoading: usersLoading, error: usersError } = useUsers();
  const { cameras, isLoading: camerasLoading, error: camerasError } = useCameras();
  const { shifts, isLoading: shiftsLoading, error: shiftsError } = useShifts();
  const { zones } = useZones();
  const { latest: latestNotification, dismiss } = useNotifications();

  const [dismissedNotification, setDismissedNotification] = useState<string | null>(null);

  // All loading = truly nothing yet
  const allLoading =
    analyticsLoading && incidentsLoading && usersLoading && camerasLoading && shiftsLoading && todayLoading && alertsLoading;

  // ─── Name Lookup Maps ─────────────────────────────────────────────────────
  const zoneNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    zones.forEach((z) => { map[z.id] = z.name; });
    return map;
  }, [zones]);

  const userNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => { map[u.id] = u.fullName; });
    return map;
  }, [users]);

  const shiftLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    shifts.forEach((s) => {
      const guardName = userNameMap[s.guardId] || "Guard";
      const zoneName = zoneNameMap[s.zoneId] || "Zone";
      const start = new Date(s.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const end = new Date(s.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      map[s.id] = `${guardName} @ ${zoneName} (${start}–${end})`;
    });
    return map;
  }, [shifts, userNameMap, zoneNameMap]);

  // ─── Stat Card Computations ─────────────────────────────────────────────────

  const activeIncidentsCount = useMemo(
    () => incidents.filter((i) => i.status !== "CLOSED").length,
    [incidents]
  );

  const criticalUnassigned = useMemo(
    () =>
      incidents.filter(
        (i) =>
          (i.priority === "HIGH" || i.priority === "CRITICAL") &&
          i.assignedGuardId === null
      ).length,
    [incidents]
  );

  const camerasOnline = useMemo(() => {
    const online = cameras.filter((c) => c.isActive).length;
    return { online, total: cameras.length };
  }, [cameras]);

  const guardsOnDuty = useMemo(() => {
    const now = new Date();
    const onDutyIds = new Set<string>();
    shifts.forEach((s) => {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      if (start <= now && now <= end) {
        onDutyIds.add(s.guardId);
      }
    });
    return onDutyIds.size;
  }, [shifts]);

  // ─── Chart Data ─────────────────────────────────────────────────────────────

  const priorityData = useMemo(() => {
    if (summary?.byPriority && Object.keys(summary.byPriority).length > 0) {
      return Object.entries(summary.byPriority).map(([name, value]) => ({
        name,
        value: Number(value),
      }));
    }
    if (incidents.length > 0) {
      const counts: Record<string, number> = {};
      incidents.forEach((inc) => {
        counts[inc.priority] = (counts[inc.priority] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }
    return [];
  }, [summary, incidents]);

  const zoneData = useMemo(() => {
    if (summary?.byZone && Object.keys(summary.byZone).length > 0) {
      return Object.entries(summary.byZone)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 8)
        .map(([id, value]) => ({
          name: zoneNameMap[id] || id.slice(0, 8),
          incidents: Number(value),
        }));
    }
    if (incidents.length > 0) {
      const counts: Record<string, number> = {};
      incidents.forEach((inc) => {
        counts[inc.zoneId] = (counts[inc.zoneId] || 0) + 1;
      });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id, value]) => ({
          name: zoneNameMap[id] || id.slice(0, 8),
          incidents: value,
        }));
    }
    return [];
  }, [summary, incidents, zoneNameMap]);

  const statusData = useMemo(() => {
    if (summary?.byStatus && Object.keys(summary.byStatus).length > 0) {
      return Object.entries(summary.byStatus).map(([name, value]) => ({
        name: name.replace(/_/g, " "),
        value: Number(value),
        key: name,
      }));
    }
    if (incidents.length > 0) {
      const counts: Record<string, number> = {};
      incidents.forEach((inc) => {
        counts[inc.status] = (counts[inc.status] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({
        name: name.replace(/_/g, " "),
        value,
        key: name,
      }));
    }
    return [];
  }, [summary, incidents]);

  // Incidents per day (last 30 days)
  const trendData = useMemo(() => {
    const today = new Date();
    const days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days[d.toISOString().split("T")[0]] = 0;
    }
    incidents.forEach((inc) => {
      const day = inc.createdAt.split("T")[0];
      if (day in days) {
        days[day]++;
      }
    });
    return Object.entries(days).map(([date, count]) => ({
      date: date.slice(5), // MM-DD format
      count,
    }));
  }, [incidents]);

  // Incidents by hour of day
  const hourData = useMemo(() => {
    const hours: number[] = new Array(24).fill(0);
    incidents.forEach((inc) => {
      const hour = new Date(inc.createdAt).getHours();
      hours[hour]++;
    });
    return hours.map((count, hour) => ({ hour: `${hour}:00`, count }));
  }, [incidents]);

  // Incidents per shift
  const shiftIncidentData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((inc) => {
      const key = inc.shiftId || "Unassigned";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([shiftId, count]) => ({
        shift: shiftId === "Unassigned" ? "Unassigned" : (shiftLabelMap[shiftId] || shiftId.slice(0, 8)),
        count,
      }));
  }, [incidents, shiftLabelMap]);

  // Guard leaderboard
  const guardLeaderboard = useMemo(() => {
    const guardMap: Record<string, { handled: number; resolutionTotal: number; resolvedCount: number }> = {};

    incidents.forEach((inc) => {
      if (!inc.assignedGuardId) return;
      if (!guardMap[inc.assignedGuardId]) {
        guardMap[inc.assignedGuardId] = { handled: 0, resolutionTotal: 0, resolvedCount: 0 };
      }
      guardMap[inc.assignedGuardId].handled++;
      if (inc.status === "CLOSED" && inc.closedAt && inc.createdAt) {
        const resSeconds =
          (new Date(inc.closedAt).getTime() - new Date(inc.createdAt).getTime()) / 1000;
        guardMap[inc.assignedGuardId].resolutionTotal += resSeconds;
        guardMap[inc.assignedGuardId].resolvedCount++;
      }
    });

    return Object.entries(guardMap)
      .map(([guardId, stats]) => {
        const user = users.find((u) => u.id === guardId);
        return {
          guardId,
          name: user?.fullName || guardId.slice(0, 8) + "…",
          handled: stats.handled,
          avgResolution:
            stats.resolvedCount > 0
              ? Math.round(stats.resolutionTotal / stats.resolvedCount / 60)
              : null,
        };
      })
      .sort((a, b) => b.handled - a.handled)
      .slice(0, 10);
  }, [incidents, users]);

  // ─── Notification Banner ────────────────────────────────────────────────────

  const showNotification =
    latestNotification && latestNotification.id !== dismissedNotification;

  // ─── Error summary ──────────────────────────────────────────────────────────

  const errors: string[] = [];
  if (analyticsError) errors.push(`Analytics: ${analyticsError}`);
  if (todayError) errors.push(`Today: ${todayError}`);
  if (alertsError) errors.push(`Alerts: ${alertsError}`);
  if (incidentsError) errors.push(`Incidents: ${incidentsError}`);
  if (usersError) errors.push(`Users: ${usersError}`);
  if (camerasError) errors.push(`Cameras: ${camerasError}`);
  if (shiftsError) errors.push(`Shifts: ${shiftsError}`);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (allLoading) {
    return (
      <div style={pageStyle}>
        <h1 style={headingStyle}>Dashboard</h1>
        <p style={loadingStyle}>Loading dashboard data...</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1 style={headingStyle}>Dashboard</h1>

      {/* Live Notification Banner */}
      {showNotification && (
        <div style={notificationBannerStyle}>
          <span>
            🔔 <strong>{latestNotification.type}</strong>:{" "}
            {typeof latestNotification.payload === "object" && latestNotification.payload !== null
              ? JSON.stringify(latestNotification.payload).slice(0, 120)
              : String(latestNotification.payload)}
          </span>
          <button
            style={dismissBtnStyle}
            onClick={() => {
              setDismissedNotification(latestNotification.id);
              dismiss();
            }}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errors.length > 0 && (
        <div style={errorBannerStyle}>
          Some data could not be loaded. {errors.join(" | ")}
        </div>
      )}

      {/* ─── Stat Cards ──────────────────────────────────────────────────────── */}
      <div style={widgetsRowStyle}>
        <SummaryWidget label="Active Incidents" value={activeIncidentsCount} />
        <SummaryWidget label="Today's Count" value={incidentsToday ?? "—"} />
        <SummaryWidget label="Critical Unassigned" value={criticalUnassigned} />
        <SummaryWidget
          label="Avg Resolution"
          value={formatMinutes(summary?.avgResolutionSeconds)}
        />
        <SummaryWidget
          label="Cameras Online"
          value={`${camerasOnline.online} / ${camerasOnline.total}`}
        />
        <SummaryWidget label="Guards On Duty" value={guardsOnDuty} />
      </div>

      {/* ─── Charts Row ──────────────────────────────────────────────────────── */}
      <div style={chartsRowStyle}>
        {/* Priority Donut */}
        {priorityData.length > 0 && (
          <div style={chartCardStyle}>
            <h3 style={chartTitleStyle}>Incidents by Priority</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={priorityData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={95}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {priorityData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={PRIORITY_COLORS[entry.name] || "#8884d8"}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Incidents by Zone */}
        {zoneData.length > 0 && (
          <div style={chartCardStyle}>
            <h3 style={chartTitleStyle}>Incidents by Zone</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={zoneData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="incidents" fill={colors.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Incidents by Status */}
        {statusData.length > 0 && (
          <div style={chartCardStyle}>
            <h3 style={chartTitleStyle}>Incidents by Status</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {statusData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={STATUS_COLORS[entry.key] || "#8884d8"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ─── Trend Line (last 30 days) ────────────────────────────────────────── */}
      {trendData.length > 0 && (
        <div style={{ ...chartCardStyle, ...sectionStyle }}>
          <h3 style={chartTitleStyle}>Incidents per Day (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke={colors.green}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ─── Incidents by Hour of Day ──────────────────────────────────────────── */}
      {hourData.some((h) => h.count > 0) && (
        <div style={{ ...chartCardStyle, ...sectionStyle }}>
          <h3 style={chartTitleStyle}>Incidents by Hour of Day</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" fontSize={10} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#2196F3" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ─── Incidents per Shift ───────────────────────────────────────────────── */}
      {shiftIncidentData.length > 0 && (
        <div style={{ ...chartCardStyle, ...sectionStyle }}>
          <h3 style={chartTitleStyle}>Incidents per Shift</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={shiftIncidentData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="shift" fontSize={10} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#FF9800" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ─── Guard Leaderboard ─────────────────────────────────────────────────── */}
      {guardLeaderboard.length > 0 && (
        <div style={{ ...chartCardStyle, ...sectionStyle }}>
          <h3 style={chartTitleStyle}>Guard Leaderboard</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Guard</th>
                <th style={thStyle}>Incidents Handled</th>
                <th style={thStyle}>Avg Resolution</th>
              </tr>
            </thead>
            <tbody>
              {guardLeaderboard.map((g, idx) => (
                <tr key={g.guardId}>
                  <td style={tdStyle}>{idx + 1}</td>
                  <td style={tdStyle}>{g.name}</td>
                  <td style={tdStyle}>{g.handled}</td>
                  <td style={tdStyle}>
                    {g.avgResolution != null ? `${g.avgResolution}m` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Critical Alerts List ──────────────────────────────────────────────── */}
      <div style={{ ...chartCardStyle, ...sectionStyle }}>
        <h3 style={chartTitleStyle}>Critical Alerts</h3>
        {alertsLoading && <p style={loadingStyle}>Loading alerts...</p>}
        {!alertsLoading && alerts.length === 0 && (
          <p style={{ ...loadingStyle, color: colors.darkGray }}>
            No critical alerts at this time.
          </p>
        )}
        {alerts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {alerts.slice(0, 20).map((alert: CriticalAlert) => (
              <AlertRow key={alert.id} alert={alert} zoneNameMap={zoneNameMap} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Alert Row Sub-component ──────────────────────────────────────────────────

function AlertRow({ alert, zoneNameMap }: { alert: CriticalAlert; zoneNameMap: Record<string, string> }) {
  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 12px",
    backgroundColor: colors.lightGray,
    borderRadius: "8px",
    fontSize: fontSizes.body,
    fontFamily,
  };

  const priorityBadgeStyle: CSSProperties = {
    fontWeight: 600,
    color: PRIORITY_COLORS[alert.priority] || colors.black,
    textTransform: "uppercase",
    fontSize: "11px",
    backgroundColor: colors.white,
    padding: "2px 8px",
    borderRadius: borderRadius.pill,
    border: `1px solid ${PRIORITY_COLORS[alert.priority] || colors.darkGray}`,
  };

  return (
    <div style={rowStyle}>
      <span style={priorityBadgeStyle}>{alert.priority}</span>
      <span style={{ flex: 1, color: colors.black }}>{alert.message}</span>
      <span style={{ color: colors.darkGray, fontSize: "12px", whiteSpace: "nowrap" }}>
        {zoneNameMap[alert.zoneId] || "Unknown Zone"}
      </span>
      <span style={{ color: colors.darkGray, fontSize: "12px", whiteSpace: "nowrap" }}>
        {formatTime(alert.createdAt)}
      </span>
    </div>
  );
}
