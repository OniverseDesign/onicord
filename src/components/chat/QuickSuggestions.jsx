import React, { memo } from "react";

const QuickSuggestions = memo(({ visibleSuggestions, selection, setInput, tyrannyInputRef }) => {
  const show = visibleSuggestions.length > 0 && !selection;

  return (
    <div
      className="w-full overflow-hidden transition-all duration-300 ease-in-out px-1 shrink-0"
      style={{
        height: show ? "36px" : "0px",
        marginBottom: show ? "6px" : "0px",
        opacity: show ? 1 : 0,
      }}
    >
      <div className="flex items-center gap-1.5 select-none py-0.5">
        {visibleSuggestions.map((text, idx) => (
          <button
            key={idx}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setInput(text);
              tyrannyInputRef.current?.focus();
            }}
            className="text-[13px] px-3.5 py-1 rounded-full bg-onicord-mantle border border-onicord-island text-onicord-text hover:text-onicord-accent hover:border-onicord-accent hover:bg-onicord-mantle transition-all cursor-pointer truncate max-w-[200px]"
            title={text}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
});

QuickSuggestions.displayName = "QuickSuggestions";
export default QuickSuggestions;
