package util

// ValidStaffRole reports whether r is allowed for users.role in this deployment.
func ValidStaffRole(r string) bool {
	switch r {
	case "admin", "manager", "inventory_manager", "counter", "kitchen":
		return true
	default:
		return false
	}
}

// AssignableFloorStaffRole is true when the user may be chosen as "assigned
// server" on dine-in orders (column orders.user_id). Server role was removed;
// counter, manager, and admin staff fill this role.
func AssignableFloorStaffRole(r string) bool {
	return r == "counter" || r == "manager" || r == "admin"
}
