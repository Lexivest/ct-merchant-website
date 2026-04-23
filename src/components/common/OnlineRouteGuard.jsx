import { useNavigate } from "react-router-dom"

import { useNetworkStatus } from "../../lib/networkStatus"
import NetworkStatusScreen from "./NetworkStatusScreen"

function OnlineRouteGuard({
  children,
  allowWhenOffline = false,
  title = "Connection required",
  message = "This screen needs internet access before it can open properly.",
}) {
  const navigate = useNavigate()
  const { isOffline } = useNetworkStatus()

  if (!allowWhenOffline && isOffline) {
    return (
      <NetworkStatusScreen
        title={title}
        message={message}
        autoRetryOnReconnect={false}
        onBack={() => {
          if (typeof window !== "undefined" && window.history.length > 1) {
            navigate(-1)
            return
          }

          navigate("/user-dashboard", { replace: true })
        }}
      />
    )
  }

  return children
}

export default OnlineRouteGuard
