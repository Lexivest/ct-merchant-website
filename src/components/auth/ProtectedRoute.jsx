import { Navigate, useLocation } from "react-router-dom"

function ProtectedRoute({
  loading = false,
  isAllowed,
  redirectTo = "/",
  children,
}) {
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm">
        Loading...
      </div>
    )
  }

  if (!isAllowed) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  return children
}

export default ProtectedRoute