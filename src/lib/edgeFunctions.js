import { supabase } from "./supabase";

function messageContainsUnauthorized(value) {
  const text = String(value || "").toLowerCase();
  return text.includes("unauthorized") || text.includes("401");
}

function isUnauthorizedInvokeError(error, data) {
  if (messageContainsUnauthorized(error?.message)) return true;
  if (messageContainsUnauthorized(data?.error)) return true;

  const status = error?.context?.status;
  if (status === 401) return true;

  return false;
}

async function getAccessTokenOrRefresh() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error("Unable to validate your session. Please sign in again.");
  }

  const currentToken = sessionData?.session?.access_token;
  if (currentToken) return currentToken;

  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    throw new Error("Session expired. Please sign in again.");
  }

  const refreshedToken = refreshedData?.session?.access_token;
  if (!refreshedToken) {
    throw new Error("Session expired. Please sign in again.");
  }

  return refreshedToken;
}

async function refreshAccessToken() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

async function invokeWithToken(functionName, body, accessToken) {
  return supabase.functions.invoke(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function invokeEdgeFunctionAuthed(functionName, body) {
  const accessToken = await getAccessTokenOrRefresh();
  let result = await invokeWithToken(functionName, body, accessToken);

  if (!isUnauthorizedInvokeError(result?.error, result?.data)) {
    return result;
  }

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) {
    throw new Error("Session expired. Please sign in again.");
  }

  result = await invokeWithToken(functionName, body, refreshedToken);
  return result;
}
