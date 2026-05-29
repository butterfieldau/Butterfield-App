---
name: Google Places address search
description: Reusable AddressSearchInput component using Google Places Autocomplete + Details APIs directly via fetch.
---

## Rule
All address entry in the app uses `components/AddressSearchInput.tsx` for autocomplete. Manual fields remain as fallback beneath the search trigger.

**Why:** Google Places provides structured address_components including suburb, state, postcode, and geometry.location (lat/lng). Replaces the previous Nominatim (OpenStreetMap) search in director/stores.tsx.

**How to apply:**
- Import `AddressSearchInput` from `@/components/AddressSearchInput`
- Pass `onSelect: (result: AddressResult) => void` to receive parsed fields
- `AddressResult` has `{ street, suburb, state, postcode, lat?, lng?, formatted? }`
- API key is `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` (shared env var, Australian addresses only)
- The component calls Autocomplete API then Place Details API on selection
- For stores (needs lat/lng): use `r.lat` and `r.lng` from the result
