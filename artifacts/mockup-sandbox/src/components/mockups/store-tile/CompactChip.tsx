export function CompactChip() {
  const stores = [
    { name: "Spice Garden Restaurant", category: "Restaurant · 0.3 km", rating: 4.8, open: true, color: "#e85d04", initial: "S", reviews: 142 },
    { name: "Ravi Mobile World", category: "Electronics · 0.7 km", rating: 4.5, open: true, color: "#1a2c4e", initial: "R", reviews: 98 },
    { name: "Fresh Mart Grocery", category: "Grocery · 1.2 km", rating: 4.3, open: false, color: "#2d6a4f", initial: "F", reviews: 67 },
    { name: "Style Hub Fashion", category: "Fashion · 1.5 km", rating: 4.6, open: true, color: "#7b2d8b", initial: "S", reviews: 211 },
    { name: "Malegaon Sweets", category: "Sweets · 0.9 km", rating: 4.7, open: true, color: "#c77b0e", initial: "M", reviews: 305 },
  ];

  return (
    <div
      style={{
        fontFamily: "'Poppins', sans-serif",
        background: "#f5f5f5",
        minHeight: "100vh",
        padding: "24px 16px",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
      />

      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "#FF6B00", letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>
          Top Stores
        </p>
        <p style={{ fontSize: 17, fontWeight: 700, color: "#1a2c4e", margin: "2px 0 0" }}>
          Near You
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stores.map((store, i) => (
          <div
            key={i}
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
              cursor: "pointer",
            }}
          >
            {/* Circular avatar */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                background: `linear-gradient(135deg, ${store.color}, ${store.color}aa)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                position: "relative",
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
                {store.initial}
              </span>
              {store.open && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 13,
                    height: 13,
                    borderRadius: 99,
                    background: "#10B981",
                    border: "2px solid #fff",
                  }}
                />
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1a2c4e",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {store.name}
              </p>
              <p style={{ margin: "1px 0 5px", fontSize: 11, color: "#888" }}>{store.category}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    background: "#FFF7F0",
                    border: "1px solid #FFD8B4",
                    borderRadius: 6,
                    padding: "1px 6px",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <span style={{ fontSize: 10, color: "#FF6B00" }}>★</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#FF6B00" }}>{store.rating}</span>
                </div>
                <span style={{ fontSize: 10, color: "#bbb" }}>·</span>
                <span style={{ fontSize: 10, color: "#aaa" }}>{store.reviews} reviews</span>
              </div>
            </div>

            {/* Chevron */}
            <div style={{ color: "#ddd", fontSize: 18, fontWeight: 300, flexShrink: 0 }}>›</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 11, color: "#999", margin: "0 0 10px", fontWeight: 500 }}>Design notes</p>
        <div style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#555", lineHeight: 1.7 }}>
            <b>Variant B — Compact Chip (List)</b><br/>
            Horizontal list rows instead of horizontal scroll tiles. Shows more stores at once, review count visible, green dot = open. Great for dense discovery.
          </p>
        </div>
      </div>
    </div>
  );
}
