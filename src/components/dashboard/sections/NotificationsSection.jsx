function NotificationsSection({ notifications = [] }) {
  return (
    <div className="screen active">
      <div className="tool-block-wrap bg-white px-4 py-6">
        <h2 className="sec-title mb-5 flex items-center gap-[10px] p-0 text-[1.35rem] font-extrabold text-[#0F1111]">
          Alerts & Notifications
        </h2>

        <div className="flex max-w-[800px] flex-col gap-3">
          {notifications.length === 0 ? (
            <p className="text-[#565959]">No notifications yet</p>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                className="mb-3 rounded-lg border p-4"
                style={{
                  background: item.is_read ? "white" : "#F7FAFA",
                  borderColor: item.is_read ? "#D5D9D9" : "#007185",
                }}
              >
                <div className="mb-[6px] flex justify-between gap-2">
                  <span className="text-[0.95rem] font-bold text-[#0F1111]">
                    {item.title}
                  </span>
                  <span className="text-[0.75rem] text-[#565959]">
                    {new Date(item.created_at).toLocaleDateString()}{" "}
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className="text-[0.9rem] leading-[1.4] text-[#0F1111]">
                  {item.message || ""}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default NotificationsSection