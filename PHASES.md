# oct-network-vlan — Implementation Phases

- [x] Phase 1: Scaffold (package.json, webpack, Containerfile, nginx, console-extensions, deploy/, .cursor/rules, AGENTS.md, README)
- [x] Phase 2: K8s models (NAD, CUDN, NNS, NNCP, Namespace models)
- [x] Phase 3: Bridge/localnet discovery (list bridges from NNS, list OVN bridge-mappings from NNCPs)
- [x] Phase 4: VLAN form UI (network type toggle, bridge selector, VLAN ID, namespace, name, advanced options)
- [x] Phase 5: NAD generation (Linux bridge CNI config JSON)
- [x] Phase 6: CUDN generation (OVN localnet YAML with vlanID, MTU, subnets)
- [x] Phase 7: Create + status (create NAD or CUDN, verify)
- [x] Phase 8: VLAN inventory + delete (list existing NADs/CUDNs, delete)
- [x] Phase 9: i18n (all user-facing strings)
- [ ] Phase 10: Build + push images (1.0.0-ocp4.22, 1.0.0-ocp4.21)
- [ ] Phase 11: Storefront integration (icon, tile, deploy bundle, BUNDLED_DEPLOY, validate)
