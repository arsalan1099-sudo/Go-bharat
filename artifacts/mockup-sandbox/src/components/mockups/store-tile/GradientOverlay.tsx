export function GradientOverlay() {
  const stores = [
    { name: "Spice Garden", category: "Restaurant", dist: "0.3 km", rating: 4.8, open: true, color: "#e85d04", initial: "S" },
    { name: "Ravi Mobiles", category: "Electronics", dist: "0.7 km", rating: 4.5, open: true, color: "#1a2c4e", initial: "R" },
    { name: "Fresh Mart", category: "Grocery", dist: "1.2 km", rating: 4.3, open: false, color: "#2d6a4f", initial: "F" },
    { name: "Style Hub", category: "Fashion", dist: "1.5 km", rating: 4.6, open: true, color: "#7b2d8b", initial: "S" },
  ];

  return (
    <div
      style={{
        fontFamily: "'Poppins', sans-serif",
        background: "#f8f8f8",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px 0",
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
      />

      <div style={{ width: 360, marginBottom: 12, paddingLeft: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "#FF6B00", letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>
          Restaurants & Food
        </p>
        <p style={{ fontSize: 17, fontWeight: 700, color: "#1a2c4e", margin: "2px 0 0" }}>
          Top Stores Near You
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 8,
          width: 360,
          scrollbarWidth: "none",
        }}
      >
        {stores.map((store, i) => (
          <div
            key={i}
            style={{
              flex: "0 0 148px",
              height: 200,
              borderRadius: 16,
              overflow: "hidden",
              position: "relative",
              boxShadow: "0 4px 18px rgba(0,0,0,0.18)",
              cursor: "pointer",
            }}
          >
            {/* Coloured image bg */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(135deg, ${store.color}dd, ${store.color}88)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 52, fontWeight: 800, color: "rgba(255,255,255,0.35)" }}>
                {store.initial}
              </span>
            </div>

            {/* Bottom gradient */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "65%",
                background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)",
              }}
            />

            {/* Open badge */}
            {store.open && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  background: "#10B981",
                  borderRadius: 20,
                  paddingLeft: 6,
                  paddingRight: 6,
                  paddingTop: 2,
                  paddingBottom: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <div style={{ width: 5, height: 5, borderRadius: 99, background: "#fff" }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>OPEN</span>
              </div>
            )}

            {/* Info overlay */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 10px 12px" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
                {store.name}
              </p>
              <p style={{ margin: "2px 0 6px", fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
                {store.category}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div
                  style={{
                    background: "rgba(255,255,255,0.18)",
                    borderRadius: 8,
                    padding: "2px 6px",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <span style={{ fontSize: 10, color: "#FFD700" }}>★</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{store.rating}</span>
                </div>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.65)" }}>{store.dist}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, width: 360, paddingLeft: 16, paddingRight: 16 }}>
        <p style={{ fontSize: 11, color: "#999", margin: "0 0 10px", fontWeight: 500 }}>Design notes</p>
        <div style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#555", lineHeight: 1.7 }}>
            <b>Variant A — Gradient Overlay</b><br/>
            Full-bleed image card. Store name + rating float over a dark gradient for high visual impact. OPEN badge top-right. Works great for photo-rich stores.
          </p>
        </div>
      </div>
    </div>
  );
}
