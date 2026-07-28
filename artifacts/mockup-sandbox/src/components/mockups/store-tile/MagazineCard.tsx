export function MagazineCard() {
  const stores = [
    { name: "Spice Garden", category: "Restaurant", dist: "0.3 km", rating: 4.8, open: true, color: "#e85d04", accent: "#FF6B00", initial: "S", tag: "Trending" },
    { name: "Ravi Mobiles", category: "Electronics", dist: "0.7 km", rating: 4.5, open: true, color: "#1a2c4e", accent: "#1a2c4e", initial: "R", tag: "Top Rated" },
    { name: "Fresh Mart", category: "Grocery", dist: "1.2 km", rating: 4.3, open: false, color: "#2d6a4f", accent: "#2d6a4f", initial: "F", tag: "Popular" },
    { name: "Style Hub", category: "Fashion", dist: "1.5 km", rating: 4.6, open: true, color: "#7b2d8b", accent: "#7b2d8b", initial: "S", tag: "New" },
  ];

  return (
    <div
      style={{
        fontFamily: "'Poppins', sans-serif",
        background: "#f0f0f0",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px 0",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
      />

      <div style={{ width: 360, marginBottom: 12, paddingLeft: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "#FF6B00", letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>
          Handpicked for You
        </p>
        <p style={{ fontSize: 17, fontWeight: 700, color: "#1a2c4e", margin: "2px 0 0" }}>
          Top Stores
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 4,
          width: 360,
          scrollbarWidth: "none",
        }}
      >
        {stores.map((store, i) => (
          <div
            key={i}
            style={{
              flex: "0 0 150px",
              background: "#fff",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
              cursor: "pointer",
            }}
          >
            {/* Saffron/accent bar */}
            <div
              style={{
                height: 4,
                background: `linear-gradient(90deg, ${store.accent}, #FF6B00)`,
              }}
            />

            {/* Image area */}
            <div
              style={{
                height: 100,
                background: `linear-gradient(145deg, ${store.color}dd 0%, ${store.color}66 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <span style={{ fontSize: 46, fontWeight: 800, color: "rgba(255,255,255,0.3)" }}>
                {store.initial}
              </span>

              {/* Tag chip */}
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  background: "rgba(255,255,255,0.95)",
                  borderRadius: 99,
                  padding: "2px 7px",
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: store.accent }}>{store.tag}</span>
              </div>
            </div>

            {/* Info */}
            <div style={{ padding: "9px 10px 11px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#1a2c4e",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {store.name}
              </p>
              <p style={{ margin: "2px 0 6px", fontSize: 10, color: "#999" }}>{store.category}</p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span
                      key={s}
                      style={{
                        fontSize: 10,
                        color: s <= Math.floor(store.rating) ? "#FF6B00" : "#ddd",
                      }}
                    >
                      ★
                    </span>
                  ))}
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#FF6B00", marginLeft: 2 }}>
                    {store.rating}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 7, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#aaa" }}>📍 {store.dist}</span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    background: store.open ? "#ECFDF5" : "#FEF2F2",
                    borderRadius: 6,
                    padding: "2px 6px",
                  }}
                >
                  <div
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 99,
                      background: store.open ? "#10B981" : "#EF4444",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: store.open ? "#10B981" : "#EF4444",
                    }}
                  >
                    {store.open ? "Open" : "Closed"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, width: 360, paddingLeft: 16, paddingRight: 16 }}>
        <p style={{ fontSize: 11, color: "#999", margin: "0 0 10px", fontWeight: 500 }}>Design notes</p>
        <div style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#555", lineHeight: 1.7 }}>
            <b>Variant C — Magazine Card</b><br/>
            Structured card with saffron accent bar at top, category tag chip on image, 5-star row rating, and colour-coded open/closed status pill. Clean and information-rich.
          </p>
        </div>
      </div>
    </div>
  );
}
