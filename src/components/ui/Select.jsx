import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import { cn } from "../../lib/cn";
import MaterialIcon from "../icons/MaterialIcon";
import { soundEngine } from "../../lib/soundEngine";

/**
 * Custom Dropdown Select estilizado según la identidad visual de Onicord.
 * Reemplaza los <select> nativos de HTML con soporte para:
 * - Menú flotante con blur y colores temáticos Onicord
 * - Opciones con iconos, descripciones y checkmarks
 * - Cierre al hacer click fuera y con tecla Escape
 * - Variantes de tamaño: "sm" | "md" | "lg"
 */
export default function Select({
  id,
  name,
  value,
  onChange,
  options = [],
  placeholder = "Seleccionar...",
  disabled = false,
  size = "md", // "sm" | "md" | "lg"
  align = "left", // "left" | "right"
  icon,
  className = "",
  triggerClassName = "",
  menuClassName = "",
  optionClassName = "",
  children,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  // Extraer opciones si vienen por children <option>
  const parsedOptions = React.useMemo(() => {
    if (options && options.length > 0) {
      return options.map((opt) => {
        if (typeof opt === "string" || typeof opt === "number") {
          return { value: String(opt), label: String(opt) };
        }
        return opt;
      });
    }

    // Fallback: Si el usuario pasa <option> como children
    if (children) {
      const extracted = [];
      React.Children.forEach(children, (child) => {
        if (React.isValidElement(child) && child.props) {
          extracted.push({
            value: child.props.value ?? child.props.children,
            label: child.props.children,
            disabled: child.props.disabled,
          });
        }
      });
      return extracted;
    }

    return [];
  }, [options, children]);

  // Encontrar la opción actualmente seleccionada
  const selectedOption = parsedOptions.find(
    (opt) => String(opt.value) === String(value)
  );

  // Cerrar al hacer clic afuera
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleOpen = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        soundEngine.playNav?.("open");
      }
      return next;
    });
  }, [disabled]);

  const handleSelect = (option) => {
    if (option.disabled) return;
    setIsOpen(false);

    if (onChange) {
      // Evento sintético compatible tanto con (val) => ... como con (e) => e.target.value
      const syntheticEvent = {
        target: { value: option.value, name, id: selectId },
        currentTarget: { value: option.value, name, id: selectId },
        value: option.value,
      };
      onChange(syntheticEvent, option);
    }
  };

  // Tamaños y paddings sincronizados con los tokens de Onicord
  const sizeStyles = {
    sm: "h-8 px-2.5 text-xs gap-1.5 rounded-onicord-button",
    md: "h-9 px-3 text-xs gap-2 rounded-onicord-button",
    lg: "h-11 px-4 text-sm gap-2.5 rounded-onicord-inner",
  };

  const chevronSizes = {
    sm: 16,
    md: 18,
    lg: 20,
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block text-left select-none", className)}
    >
      {/* TRIGGER BUTTON */}
      <button
        id={selectId}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "w-full flex items-center justify-between border font-medium transition-all duration-150 outline-none box-border",
          "bg-onicord-mantle/80 hover:bg-onicord-mantle border-onicord-island",
          "text-onicord-text placeholder:text-onicord-faded",
          "focus-visible:border-onicord-accent/60 focus-visible:ring-2 focus-visible:ring-onicord-accent/20",
          isOpen && "bg-onicord-mantle",
          disabled && "opacity-50 cursor-not-allowed",
          sizeStyles[size] || sizeStyles.md,
          triggerClassName
        )}
      >
        <div className="flex items-center gap-2 min-w-0 pr-1">
          {icon && (
            <span className="shrink-0 text-onicord-muted flex items-center">
              {typeof icon === "string" ? (
                <MaterialIcon name={icon} size={chevronSizes[size]} />
              ) : (
                icon
              )}
            </span>
          )}

          {selectedOption?.icon && (
            <span className="shrink-0 flex items-center">
              {typeof selectedOption.icon === "string" ? (
                <MaterialIcon name={selectedOption.icon} size={chevronSizes[size]} />
              ) : (
                selectedOption.icon
              )}
            </span>
          )}

          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        {/* FLECHA CHEVRON CON ROTACIÓN ANIMADA */}
        <span
          className={cn(
            "text-onicord-muted shrink-0 flex items-center transition-transform duration-200",
            isOpen && "rotate-180 text-onicord-accent"
          )}
        >
          <MaterialIcon name="expand_more" size={chevronSizes[size]} />
        </span>
      </button>

      {/* DROPDOWN MENU POPOVER */}
      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className={cn(
            "absolute z-50 mt-1.5 w-max min-w-full p-1.5 flex flex-col gap-1",
            "bg-onicord-mantle",
            "border border-onicord-island rounded-onicord-button",
            "max-h-64 overflow-y-auto minimal-scrollbar [scrollbar-gutter:auto]",
            "animate-fade-in origin-top",
            align === "right" ? "right-0" : "left-0",
            menuClassName
          )}
        >
          {parsedOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-onicord-muted text-center italic">
              No hay opciones
            </div>
          ) : (
            parsedOptions.map((opt) => {
              const isSelected = String(opt.value) === String(value);

              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-xs transition-all duration-150 cursor-pointer",
                    isSelected
                      ? "bg-onicord-accent/15 text-onicord-accent font-semibold"
                      : "text-onicord-text hover:bg-white/5 hover:text-white",
                    opt.disabled && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-inherit",
                    optionClassName
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {opt.icon && (
                      <span className="shrink-0 flex items-center">
                        {typeof opt.icon === "string" ? (
                          <MaterialIcon name={opt.icon} size={16} />
                        ) : (
                          opt.icon
                        )}
                      </span>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{opt.label}</span>
                      {opt.description && (
                        <span className="text-[10px] text-onicord-muted font-normal truncate">
                          {opt.description}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* CHECKMARK PARA OPCIÓN SELECCIONADA */}
                  {isSelected && (
                    <span className="shrink-0 text-onicord-accent flex items-center pl-2">
                      <MaterialIcon name="check" size={14} />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
