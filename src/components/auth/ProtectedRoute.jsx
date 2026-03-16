import { Navigate, useLocation } from "react-router-dom"

function ProtectedRoute({
  isAllowed,
  redirectTo = "/",
  children,
}) {
  const location = useLocation()

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