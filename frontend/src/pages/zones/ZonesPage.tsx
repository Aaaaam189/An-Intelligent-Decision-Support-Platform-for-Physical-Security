import { useState, type CSSProperties } from "react";
import { useZones, useCreateZone, useUpdateZone, useDeleteZone } from "../../hooks/useZones";
import CreateZoneForm from "../../components/zones/CreateZoneForm";
import ZoneRow from "../../components/zones/ZoneRow";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { colors, fontFamily, fontSizes } from "../../constants/theme";
import type { Zone } from "../../types/zone.types";

export default function ZonesPage() {
  const { zones, isLoading, error } = useZones();
  const createMutation = useCreateZone();
  const updateMutation = useUpdateZone();
  const deleteMutation = useDeleteZone();

  const [updatingZoneId, setUpdatingZoneId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Zone | null>(null);

  function handleCreate(name: string) {
    createMutation.mutate(name);
  }

  function handleUpdate(id: string, name: string) {
    setUpdatingZoneId(id);
    updateMutation.mutate({ id, name });
  }

  function handleDeleteClick(zone: Zone) {
    setDeleteTarget(zone);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  const pageStyle: CSSProperties = {
    padding: "32px",
    fontFamily,
  };

  const headingStyle: CSSProperties = {
    fontSize: fontSizes.pageHeading,
    fontWeight: 600,
    color: colors.black,
    marginBottom: "24px",
    fontFamily,
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

  return (
    <div style={pageStyle}>
      <h1 style={headingStyle}>Zones</h1>

      <CreateZoneForm
        onCreate={handleCreate}
        isCreating={createMutation.isPending}
        createError={createMutation.error ? createMutation.error.message : null}
      />

      {isLoading && <p style={loadingStyle}>Loading zones...</p>}

      {error && <p style={errorStyle} role="alert">{error}</p>}

      {!isLoading && !error && (
        <div>
          {zones.map((zone) => (
            <ZoneRow
              key={zone.id}
              zone={zone}
              onUpdate={handleUpdate}
              onDelete={handleDeleteClick}
              isUpdating={
                updateMutation.isPending && updatingZoneId === zone.id
              }
              updateError={
                updatingZoneId === zone.id && updateMutation.error
                  ? updateMutation.error.message
                  : null
              }
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete Zone"
        message={`Are you sure you want to delete the zone "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
