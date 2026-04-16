const NAME_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];
const NAME_SYMBOLS = ["-", "."];

const AGE_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["0"],
];

export default function VirtualKeyboard({ mode, value, onChange }) {
  const current = String(value ?? "");

  const appendChar = (char) => {
    if (mode === "age") {
      const next = `${current}${char}`.replace(/\D/g, "").slice(0, 3);
      onChange(next);
      return;
    }
    const next = `${current}${char}`.replace(/\s{2,}/g, " ").slice(0, 40);
    onChange(next);
  };

  const backspace = () => {
    onChange(current.slice(0, -1));
  };

  const clearAll = () => {
    onChange("");
  };

  const handleMouseDown = (event) => {
    event.preventDefault();
  };

  if (mode === "age") {
    return (
      <div className="virtual-keyboard virtual-keyboard-age">
        <div className="vk-grid vk-grid-age">
          {AGE_ROWS.flat().map((key) => (
            <button
              key={key}
              type="button"
              className={`vk-key vk-key-age ${key === "0" ? "vk-key-zero" : ""}`}
              onMouseDown={handleMouseDown}
              onClick={() => appendChar(key)}
              style={key === "0" ? { gridColumn: "2 / 3", gridRow: "4 / 5" } : undefined}
            >
              {key}
            </button>
          ))}
          <button
            type="button"
            className="vk-key vk-key-age vk-key-action vk-key-clear"
            onMouseDown={handleMouseDown}
            onClick={clearAll}
            style={{ gridColumn: "1 / 2", gridRow: "4 / 5" }}
          >
            C
          </button>
          <button
            type="button"
            className="vk-key vk-key-age vk-key-action vk-key-backspace"
            onMouseDown={handleMouseDown}
            onClick={backspace}
            style={{ gridColumn: "3 / 4", gridRow: "4 / 5" }}
            aria-label="Backspace"
          >
            ⌫
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="virtual-keyboard virtual-keyboard-name">
      <div className="vk-grid vk-grid-name">
        {NAME_ROWS.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="vk-row">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                className="vk-key"
                onMouseDown={handleMouseDown}
                onClick={() => appendChar(key)}
              >
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="vk-actions">
        {NAME_SYMBOLS.map((key) => (
          <button
            key={key}
            type="button"
            className="vk-key vk-key-symbol"
            onMouseDown={handleMouseDown}
            onClick={() => appendChar(key)}
          >
            {key}
          </button>
        ))}
        <button type="button" className="vk-key vk-key-space" onMouseDown={handleMouseDown} onClick={() => appendChar(" ")} aria-label="Space">
          ␣
        </button>
        <button type="button" className="vk-key vk-key-action vk-key-backspace" onMouseDown={handleMouseDown} onClick={backspace} aria-label="Backspace">
          ←
        </button>
      </div>
    </div>
  );
}
