# Network VLAN (OpenShift Community Tools)

**Community project. Not officially supported by Red Hat.**

Standalone OpenShift Console plugin that creates VLAN networks from discovered Linux bridges and OVN localnets. Generates NetworkAttachmentDefinitions (NADs) for Linux bridge VLANs and ClusterUserDefinedNetworks (CUDNs) for OVN localnet VLANs.

- **Plugin ID:** `oct-network-vlan`
- **Version:** `1.1.2`
- **Image:** `quay.io/cjanisze/oct-network-vlan:1.1.2-ocp4.22` and `:1.1.2-ocp4.21` (`<semver>-ocp<major.minor>`; always publish both minors)

Validated on OpenShift **4.22** (PatternFly 6). Open from **Community Tools → Network** after the storefront (`oct-storefront`) and this plugin are enabled.

## Features

- **Bridge Discovery:** Discovers linux-bridge and ovs-bridge interfaces from NMState NodeNetworkState resources.
- **OVN Localnet Discovery:** Reads OVN `bridge-mappings` from NodeNetworkConfigurationPolicy resources.
- **NAD Creation:** Generates NetworkAttachmentDefinitions with bridge CNI config for Linux bridge VLANs.
- **CUDN Creation:** Generates ClusterUserDefinedNetworks with localnet topology for OVN VLANs.
- **Inventory:** Lists and deletes NADs/CUDNs managed by this tool (label `app.kubernetes.io/managed-by: oct-network-vlan`).

## Navigation

Route: `/community-tools/network/vlan`. Uses `useNavigate` from `react-router-dom-v5-compat`.

```bash
yarn install
yarn build
```

Deploy: edit the image in `deploy/install.yaml`, `oc apply -f deploy/install.yaml` (only when asked), then enable `oct-network-vlan` in `consoles.operator.openshift.io/cluster` `spec.plugins` (or use the storefront **Add** action).

## Contributing — cluster-portable code

Do **not** hardcode environment-specific values (VLAN IDs, CIDRs, bridge names, StorageClasses, hostnames). The UI reads live NMState and NNCPs; the user supplies the VLAN configuration. Agents: `.cursor/rules/oct-no-env-hardcoding.mdc`.

## NMState

The page needs the Kubernetes NMState operator. If it is not installed, the page offers a one-click install from `redhat-operators`.
