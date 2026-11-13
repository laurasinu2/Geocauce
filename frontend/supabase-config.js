// GeoCauce R42 self-hosted backend. All requests remain on the current HTTPS origin.
// No passwords, JWT signing keys or database credentials belong in this file.
window.GEOCAUCE_CLOUD_CONFIG = {
  supabaseUrl: window.location.origin,
  publishableKey: 'geocauce-selfhosted',
  enabled: true
};
