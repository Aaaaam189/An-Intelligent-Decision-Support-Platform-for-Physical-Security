import { useState, useMemo, type CSSProperties } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useAnalyticsSummary } from "../../hooks/useAnalytics";
import { useZones } from "../../hooks/useZones";
import Select from "../../components/ui/Select";
import { PRIORITY_COLORS, STATUS_COLORS } from "../../constants/priority";
import {
  colors,
  fontFamily,
  fontSizes,
  borderRadius,
} from "../../constants/theme";
import type { AnalyticsFilters } from "../../types/analytics.types";

export default function AnalyticsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priority, setPriority] = useState("");
  const [zoneId, setZoneId] = useState("");

  const { zones } = useZones();

  const filters: AnalyticsFilters = useMemo(() => {
    const f: AnalyticsFilters = {};
    if (startDate) f.startDate = startDate;
    if (endDate) f.endDate = endDate;
    if (priority) f.priority = priority;
    if (zoneId) f.zoneId = zoneId;
    return f;
  }, [startDate, endDate, priority, zoneId]);

  const { summary, isLoading, error } = useAnalyticsSummary(filters);

  // Build zone lookup map
  const zoneMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const zone of zones) {
      map[zone.id] = zone.name;
    }
    return map;
  }, [zones]);

  // Chart data transforms
  const priorityChartData = useMemo(() => {
    if (!summary?.byPriority) return [];
    return Object.entries(summary.byPriority).map(([name, value]) => ({
      name,
      value,
    }));
  }, [summary]);

  const statusChartData = useMemo(() => {
    if (!summary?.byStatus) return [];
    return Object.entries(summary.byStatus).map(([name, value]) => ({
      name,
      value,
    }));
  }, [summary]);

  const zoneChartData = useMemo(() => {
    if (!summary?.byZone) return [];
    return Object.entries(summary.byZone).map(([id, value]) => ({
      name: zoneMap[id] ?? id,
      value,
    }));
  }, [summary, zoneMap]);

  // Filter options
  const priorityOptions = [
    { value: "", label: "All Priorities" },
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "CRITICAL", label: "Critical" },
  ];

  const zoneOptions = useMemo(
    () => [
      { value: "", label: "All Zones" },
      ...zones.map((z) => ({ value: z.id, label: z.name })),
    ],
    [zones]
  );

  function formatResolutionTime(seconds: number | null): string {
    if (seconds === null) return "N/A";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
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

  const filtersContainerStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
    alignItems: "flex-end",
    marginBottom: "32px",
    padding: "20px",
    borderRadius: borderRadius.card,
    backgroundColor: colors.white,
    border: `1px solid ${colors.darkGray}`,
  };

  const dateInputStyle: CSSProperties = {
    padding: "12px 20px",
    borderRadius: borderRadius.pill,
    border: "1px solid transparent",
    backgroundColor: colors.darkGray,
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    outline: "none",
    boxSizing: "border-box",
  };

  const dateGroupStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  };

  const dateLabelStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    color: colors.black,
  };

  const statsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "32px",
  };

  const statCardStyle: CSSProperties = {
    padding: "20px",
    borderRadius: borderRadius.card,
    backgroundColor: colors.white,
    border: `1px solid ${colors.darkGray}`,
    textAlign: "center",
  };

  const statValueStyle: CSSProperties = {
    fontSize: fontSizes.pageHeading,
    fontWeight: 700,
    color: colors.black,
    fontFamily,
    margin: "0 0 4px 0",
  };

  const statLabelStyle: CSSProperties = {
    fontSize: fontSizes.body,
    color: colors.darkGray,
    fontFamily,
    margin: 0,
  };

  const chartsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "24px",
    marginBottom: "32px",
  };

  const chartCardStyle: CSSProperties = {
    padding: "20px",
    borderRadius: borderRadius.card,
    backgroundColor: colors.white,
    border: `1px solid ${colors.darkGray}`,
  };

  const chartTitleStyle: CSSProperties = {
    fontSize: fontSizes.sectionHeading,
    fontWeight: 600,
    color: colors.black,
    fontFamily,
    margin: "0 0 16px 0",
  };

  const fullWidthChartStyle: CSSProperties = {
    ...chartCardStyle,
    gridColumn: "1 / -1",
  };

  const selectWrapperStyle: CSSProperties = {
    minWidth: "180px",
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={headingStyle}>Analytics</h1>
      </div>

      {/* Filters */}
      <div style={filtersContainerStyle}>
        <div style={dateGroupStyle}>
          <label style={dateLabelStyle}>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={dateInputStyle}
            aria-label="Start date filter"
          />
        </div>
        <div style={dateGroupStyle}>
          <label style={dateLabelStyle}>End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={dateInputStyle}
            aria-label="End date filter"
          />
        </div>
        <div style={selectWrapperStyle}>
          <Select
            label="Priority"
            options={priorityOptions}
            value={priority}
            onChange={setPriority}
            placeholder="All Priorities"
          />
        </div>
        <div style={selectWrapperStyle}>
          <Select
            label="Zone"
            options={zoneOptions}
            value={zoneId}
            onChange={setZoneId}
            placeholder="All Zones"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && <p style={loadingStyle}>Loading analytics...</p>}

      {/* Error */}
      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}

      {/* Content */}
      {!isLoading && !error && summary && (
        <>
          {/* Summary Statistics */}
          <div style={statsGridStyle}>
            <div style={statCardStyle}>
              <p style={statValueStyle}>{summary.totalIncidents}</p>
              <p style={statLabelStyle}>Total Incidents</p>
            </div>
            <div style={statCardStyle}>
              <p style={statValueStyle}>
                {formatResolutionTime(summary.avgResolutionSeconds)}
              </p>
              <p style={statLabelStyle}>Avg Resolution Time</p>
            </div>
            {Object.entries(summary.byPriority).map(([key, val]) => (
              <div key={key} style={statCardStyle}>
                <p style={{ ...statValueStyle, color: PRIORITY_COLORS[key] ?? colors.black }}>
                  {val}
                </p>
                <p style={statLabelStyle}>{key}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div style={chartsGridStyle}>
            {/* Priority Distribution Pie Chart */}
            <div style={chartCardStyle}>
              <h2 style={chartTitleStyle}>Priority Distribution</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={priorityChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {priorityChartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={PRIORITY_COLORS[entry.name] ?? colors.darkGray}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Status Bar Chart */}
            <div style={chartCardStyle}>
              <h2 style={chartTitleStyle}>Status Breakdown</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={statusChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily }} />
                  <YAxis tick={{ fontSize: 12, fontFamily }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Incidents">
                    {statusChartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={STATUS_COLORS[entry.name] ?? colors.darkGray}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Zone Bar Chart - Full Width */}
            <div style={fullWidthChartStyle}>
              <h2 style={chartTitleStyle}>Incidents by Zone</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={zoneChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily }} />
                  <YAxis tick={{ fontSize: 12, fontFamily }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Incidents" fill={colors.green} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
