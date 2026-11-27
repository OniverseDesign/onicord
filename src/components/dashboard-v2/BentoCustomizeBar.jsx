import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import Tooltip from "../ui/Tooltip";

export default function BentoCustomizeBar({
  canUndo = false,
  canRedo = false,
  onOpenGallery,
  onUndo,
  onRedo,
  onReset,
  onDone,
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpenGallery}
        className="onicord-btn-secondary border border-onicord-border bg-onicord-surface gap-1.5"
      >
        <MaterialIcon name="add_box" size={16} />
        <span>{t("dashboard.v2.addWidget", "Add widget")}</span>
      </button>

      <div className="flex items-center gap-1.5">
        <Tooltip content={t("dashboard.v2.undo", "Undo (Ctrl+Z)")} side="bottom">
          <span className="inline-flex">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="onicord-icon-btn-md disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              <MaterialIcon name="undo" size={16} />
            </button>
          </span>
        </Tooltip>
        <Tooltip content={t("dashboard.v2.redo", "Redo (Ctrl+Y)")} side="bottom">
          <span className="inline-flex">
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="onicord-icon-btn-md disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              <MaterialIcon name="redo" size={16} />
            </button>
          </span>
        </Tooltip>
      </div>

      <Tooltip content={t("dashboard.v2.resetTitle", "Reset to default layout")} side="bottom">
        <button
          type="button"
          onClick={onReset}
          className="onicord-btn-danger-soft gap-1.5"
        >
          <MaterialIcon name="restart_alt" size={15} />
          <span className="hidden sm:inline">{t("dashboard.v2.reset", "Reset")}</span>
        </button>
      </Tooltip>

      <button
        type="button"
        onClick={onDone}
        className="onicord-btn-primary gap-1.5"
      >
        <MaterialIcon name="check" size={16} />
        <span>{t("dashboard.v2.done", "Done")}</span>
      </button>
    </div>
  );
}
