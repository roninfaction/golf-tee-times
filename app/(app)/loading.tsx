export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "3px solid rgba(255,255,255,0.12)",
          borderTopColor: "#30D158",
          animation: "gp-spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes gp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
