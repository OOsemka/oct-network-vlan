# Network VLAN — OCT extension

This is a **standalone ConsolePlugin** (`oct-network-vlan`). It is **OpenShift Community Tools (OCT)**, a **community project, not officially supported by Red Hat**. Do not describe it as official Red Hat software.

Do not add Community Tools category nav here. Users open this page from the storefront Network hub (**Open** / `/community-tools/network/vlan`).

## Identifiers

| | Value |
| --- | --- |
| Plugin ID / ConsolePlugin / `package.json` `consolePlugin.name` | **`oct-network-vlan`** |
| Image | `quay.io/cjanisze/oct-network-vlan:1.0.0-ocp4.22` (`<semver>-ocp<major.minor>`) |
| i18n | `plugin__oct-network-vlan` |

Display name is **Network VLAN**. No PVC or discovery sidecar.

**Current version:** `1.0.0` (package.json / consolePlugin.version).

## Architecture (short)

| Piece | Role |
| --- | --- |
| Console dynamic plugin (`src/`, `console-extensions.json`) | VLAN network creation route. Kubernetes API via Console SDK. |
| Plugin nginx container (`Containerfile`, `deploy/`) | Serves webpack `dist/`. ConsolePlugin **oct-network-vlan**. |

No sidecar. No PVC. All API calls go through the Console SDK proxy.

## Exposed modules

| Module | Route | Description |
| --- | --- | --- |
| `NetworkVlanPage` | `/community-tools/network/vlan` | Single-page form to discover bridges/localnets, create NADs and CUDNs, and manage inventory. |

## What this plugin owns

- Route `/community-tools/network/vlan`
- Bridge discovery from NodeNetworkState (linux-bridge, ovs-bridge)
- OVN localnet discovery from NNCP `ovn.bridge-mappings`
- Creating NetworkAttachmentDefinition (NAD) for Linux bridge VLANs
- Creating ClusterUserDefinedNetwork (CUDN) for OVN localnet VLANs
- Inventory and deletion of NADs/CUDNs with label `app.kubernetes.io/managed-by: oct-network-vlan`

## K8s resources watched/created

| Resource | Scope | Purpose |
| --- | --- | --- |
| `NodeNetworkState` (nmstate.io/v1beta1) | cluster | Discover linux-bridge and ovs-bridge interfaces |
| `NodeNetworkConfigurationPolicy` (nmstate.io/v1) | cluster | Read OVN bridge-mappings for localnet discovery |
| `NetworkAttachmentDefinition` (k8s.cni.cncf.io/v1) | namespaced | Create and list Linux bridge NADs |
| `ClusterUserDefinedNetwork` (k8s.ovn.org/v1) | cluster | Create and list OVN localnet CUDNs |
| `Namespace` (v1) | cluster | Namespace picker for target namespace |

## Network types

### Linux Bridge VLAN
Creates a NAD with bridge CNI config pointing at a discovered linux-bridge. The NAD includes `bridge.network.kubevirt.io/<bridgeName>` resource annotation for KubeVirt compatibility. MAC spoof check is off by default.

### OVN Localnet VLAN
Creates a CUDN with `topology: localnet` pointing at a `physicalNetworkName` discovered from NNCP `ovn.bridge-mappings`. Requires a VLAN ID (1–4094). Supports MTU, role (secondary/primary), and optional subnets.

## OpenShift and extension versions

Two axes in the catalog: git tag **`v1.x.x`** (semver) and optional branch **`ocp-X.Y`** when PatternFly or APIs diverge. Image tags **always** `<semver>-ocp<major.minor>` (e.g. `1.0.0-ocp4.22`). **Always publish both** OpenShift minor tags.

- Git: `main` tracks the newest supported minor (currently **4.22**).
- Images: `oct-network-vlan:1.0.0-ocp4.22` and `:1.0.0-ocp4.21`.
- PatternFly 6 on 4.22; do not mix PF majors on one branch.

## Navigation (React Router v6 via v5-compat)

Uses `useNavigate` from `react-router-dom-v5-compat` (^6.30.0). Breadcrumb and "Back to Network" navigate to `/community-tools/network`. Route registered at `/community-tools/network/vlan` via `console-extensions.json`.

## Storefront registration

Catalog PR against `oct-storefront` `catalog/community.yaml` (`source: community`, `category: network`, `spec.versions[]` with `version` + `openshift` + combined `image`). `spec.href` must stay `/community-tools/network/vlan` unless `console-extensions.json` changes.

## Add must go Ready

Storefront **Add** can succeed while the plugin never becomes Ready (**Open** 404s). Follow **oct-storefront** `docs/extension-standard.md`: catalog `versions[].image` must be the **combined** tag, **exist**, and be **public**; confirm the plugin Deployment is Running. This plugin has no PVC or sidecar.

## PatternFly 6

No PatternFly CSS imports. CSS prefix `netvlan-`.

## No environment-specific hardcoding

Never bake in lab networks, StorageClasses, hostnames, or similar. Bridges, localnets, and VLAN IDs come from the user's form and live cluster state. See `.cursor/rules/oct-no-env-hardcoding.mdc`.

## Verify

```bash
yarn install
yarn build
```
