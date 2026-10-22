#!/bin/bash
# tide-request.sh — file governed TideCloak changes for the CaseCommons demo.
#
# Every command here only FILES a change request (TideCloak answers 202). Nothing takes effect
# until enough linked Tide admins approve it in the TideCloak admin console (Change requests),
# signing in the Tide enclave. This script cannot approve anything.
#
#   bash scripts/tide-request.sh users                         list realm users (username, id, roles)
#   bash scripts/tide-request.sh pending                       list pending change requests
#   bash scripts/tide-request.sh invite-admin <username>       create a user (CREATE_USER change request)
#   bash scripts/tide-request.sh invite-link <username>        print the account-link invite for a user
#   bash scripts/tide-request.sh grant-admin <username>        request tide-realm-admin for a linked user
#   bash scripts/tide-request.sh grant <user-id> <realm-role>  request a realm role (cc-counsellor, cc-reviewer, cc-platform-admin)
#   bash scripts/tide-request.sh revoke <user-id> <realm-role> request removal of a realm role
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$PROJECT_DIR/.env" ] && { set -a; . "$PROJECT_DIR/.env"; set +a; }
: "${KC_BOOTSTRAP_ADMIN_PASSWORD:?set it in .env}"
URL="${TIDECLOAK_URL:-http://localhost:8080}"
REALM="${REALM_NAME:-casecommons}"
A="$URL/admin/realms/$REALM"

tok() {
  curl -s -X POST "$URL/realms/master/protocol/openid-connect/token" -d client_id=admin-cli -d grant_type=password \
    --data-urlencode "username=${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" --data-urlencode "password=$KC_BOOTSTRAP_ADMIN_PASSWORD" | jq -r .access_token
}
req() { # method path [json]
  local m=$1 p=$2; shift 2
  curl -s -w '\nHTTP %{http_code}\n' -X "$m" "$A$p" -H "Authorization: Bearer $(tok)" -H "Content-Type: application/json" "$@"
}
user_id() { curl -s "$A/users?username=$1&exact=true" -H "Authorization: Bearer $(tok)" | jq -r '.[0].id // empty'; }

case "${1:-}" in
  users)
    for row in $(curl -s "$A/users?max=100" -H "Authorization: Bearer $(tok)" | jq -r '.[] | "\(.id)|\(.username)|\(.firstName // "")"'); do
      IFS='|' read -r id un fn <<<"$row"
      roles=$(curl -s "$A/users/$id/role-mappings/realm" -H "Authorization: Bearer $(tok)" | jq -r '[.[].name | select(startswith("cc-"))] | join(",")')
      printf '%s  %-20s %-14s %s\n' "$id" "${un:0:20}" "$fn" "$roles"
    done ;;
  pending)
    curl -s "$A/iga/change-requests?status=PENDING" -H "Authorization: Bearer $(tok)" \
      | jq -r '.[] | "\(.id)  \(.actionType)  \(.entityType)  approvals=\(.authorizationCount // .authCount // 0)/\(.threshold // "?")  ready=\(.readyToCommit)"' ;;
  invite-admin)
    un="${2:?username}"
    req POST /users -d "{\"username\":\"$un\",\"firstName\":\"$un\",\"lastName\":\"Approver\",\"enabled\":true,\"attributes\":{\"tideInvitable\":[\"true\"]}}"
    echo "==> CREATE_USER filed. Approve it in the TideCloak admin console (Change requests), then run:"
    echo "    bash scripts/tide-request.sh invite-link $un"
    echo "    and after they link: bash scripts/tide-request.sh grant-admin $un" ;;
  grant-admin)
    id=$(user_id "${2:?username}"); [ -n "$id" ] || { echo "User not found"; exit 1; }
    rm_id=$(curl -s "$A/clients?clientId=realm-management" -H "Authorization: Bearer $(tok)" | jq -r '.[0].id')
    rep=$(curl -s "$A/clients/$rm_id/roles/tide-realm-admin" -H "Authorization: Bearer $(tok)")
    req POST "/users/$id/role-mappings/clients/$rm_id" -d "[$rep]"
    echo "==> GRANT_ROLES (tide-realm-admin) filed. Existing Tide admins approve it in the console." ;;
  invite-link)
    id=$(user_id "${2:?username}"); [ -n "$id" ] || { echo "User not found (is its CREATE_USER change request approved?)"; exit 1; }
    curl -s -X POST "$A/tideAdminResources/get-required-action-link?userId=$id&lifespan=43200" \
      -H "Authorization: Bearer $(tok)" -H "Content-Type: application/json" -d '["link-tide-account-action"]'; echo ;;
  grant|revoke)
    uid="${2:?user id}"; role="${3:?realm role}"
    rep=$(curl -s "$A/roles/$role" -H "Authorization: Bearer $(tok)")
    method=$([ "$1" = grant ] && echo POST || echo DELETE)
    req "$method" "/users/$uid/role-mappings/realm" -d "[$rep]"
    echo "==> Filed. Approve it in the TideCloak admin console (Change requests). The user gets the role at their next sign-in." ;;
  *) sed -n '2,15p' "$0"; exit 1 ;;
esac
