/**
 * Bridge/localnet discovery, NAD/CUDN generation, and inventory for the Network VLAN tool.
 */

export type VlanNetworkType = 'linux-bridge' | 'ovn-localnet';

export type NmstateInterfaceStatus = {
  name?: string;
  type?: string;
  state?: string;
  'mac-address'?: string;
  mtu?: number;
  controller?: string;
  bridge?: {
    port?: Array<{ name?: string } | string>;
  };
  vlan?: {
    'base-iface'?: string;
    id?: number;
  };
  ethernet?: {
    speed?: number;
  };
};

export type NodeNetworkStateKind = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  status?: {
    currentState?: {
      interfaces?: NmstateInterfaceStatus[];
    };
  };
};

export type NncpDesiredInterface = {
  name?: string;
  type?: string;
  state?: string;
  bridge?: {
    port?: Array<{ name?: string } | string>;
  };
};

export type NncpOvnBridgeMapping = {
  localnet: string;
  bridge: string;
  state?: string;
};

export type NncpKind = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  spec?: {
    nodeSelector?: Record<string, string>;
    desiredState?: {
      interfaces?: NncpDesiredInterface[];
      ovn?: {
        'bridge-mappings'?: NncpOvnBridgeMapping[];
      };
    };
  };
};

export type NetworkAttachmentDefinitionKind = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: {
    config?: string;
  };
};

export type CudnLocalNet = {
  physicalNetworkName?: string;
  vlanID?: number;
  mtu?: number;
  role?: string;
  subnets?: Array<{
    cidr: string;
    gateway?: string;
  }>;
};

export type ClusterUserDefinedNetworkKind = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
  spec?: {
    namespaceSelector?: {
      matchLabels?: Record<string, string>;
      matchExpressions?: Array<{
        key: string;
        operator: string;
        values?: string[];
      }>;
    };
    network?: {
      topology?: string;
      localNet?: CudnLocalNet;
    };
  };
};

export type BridgeInfo = {
  name: string;
  type: 'linux-bridge' | 'ovs-bridge';
  nodes: string[];
  vlanId?: number;
};

export type OvnLocalnetInfo = {
  localnetName: string;
  bridgeName: string;
  nodes: string[];
};

export type VlanInventoryItem = {
  name: string;
  namespace: string;
  type: 'nad' | 'cudn';
  bridgeName?: string;
  vlanId?: number;
  physicalNetwork?: string;
};

export type NamespaceKind = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
  };
};

const MANAGED_BY_LABEL = 'oct-network-vlan';

/**
 * Discover linux-bridge type interfaces from NodeNetworkState resources.
 */
export function discoverLinuxBridges(nnsList: NodeNetworkStateKind[]): BridgeInfo[] {
  const bridgeMap = new Map<string, BridgeInfo>();

  for (const nns of nnsList) {
    const nodeName = nns.metadata.name;
    const interfaces = nns.status?.currentState?.interfaces || [];

    for (const iface of interfaces) {
      if (!iface.name) continue;
      const type = (iface.type || '').toLowerCase();
      if (type !== 'linux-bridge') continue;
      const existing = bridgeMap.get(iface.name);
      if (existing) {
        if (!existing.nodes.includes(nodeName)) {
          existing.nodes.push(nodeName);
        }
      } else {
        bridgeMap.set(iface.name, {
          name: iface.name,
          type: 'linux-bridge',
          nodes: [nodeName],
        });
      }
    }
  }

  return Array.from(bridgeMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Discover ovs-bridge type interfaces from NodeNetworkState resources.
 */
export function discoverOvsBridges(nnsList: NodeNetworkStateKind[]): BridgeInfo[] {
  const bridgeMap = new Map<string, BridgeInfo>();

  for (const nns of nnsList) {
    const nodeName = nns.metadata.name;
    const interfaces = nns.status?.currentState?.interfaces || [];

    for (const iface of interfaces) {
      if (!iface.name) continue;
      const type = (iface.type || '').toLowerCase();
      if (type !== 'ovs-bridge') continue;
      const existing = bridgeMap.get(iface.name);
      if (existing) {
        if (!existing.nodes.includes(nodeName)) {
          existing.nodes.push(nodeName);
        }
      } else {
        bridgeMap.set(iface.name, {
          name: iface.name,
          type: 'ovs-bridge',
          nodes: [nodeName],
        });
      }
    }
  }

  return Array.from(bridgeMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Discover OVN bridge-mappings from NodeNetworkConfigurationPolicy resources.
 */
export function discoverOvnLocalnets(nncps: NncpKind[]): OvnLocalnetInfo[] {
  const localnetMap = new Map<string, OvnLocalnetInfo>();

  for (const nncp of nncps) {
    const mappings = nncp.spec?.desiredState?.ovn?.['bridge-mappings'] || [];
    const nodeSelector = nncp.spec?.nodeSelector || {};
    const nodeHint = Object.values(nodeSelector).join(',') || nncp.metadata.name;

    for (const mapping of mappings) {
      if (!mapping.localnet || !mapping.bridge) continue;
      if (mapping.state === 'absent') continue;
      const existing = localnetMap.get(mapping.localnet);
      if (existing) {
        if (!existing.nodes.includes(nodeHint)) {
          existing.nodes.push(nodeHint);
        }
      } else {
        localnetMap.set(mapping.localnet, {
          localnetName: mapping.localnet,
          bridgeName: mapping.bridge,
          nodes: [nodeHint],
        });
      }
    }
  }

  return Array.from(localnetMap.values()).sort((a, b) =>
    a.localnetName.localeCompare(b.localnetName),
  );
}

/**
 * Build a NetworkAttachmentDefinition for a Linux bridge VLAN.
 */
export function buildLinuxBridgeNad(opts: {
  name: string;
  namespace: string;
  bridgeName: string;
  macspoofchk: boolean;
  cniVersion?: string;
}): NetworkAttachmentDefinitionKind {
  const cniVersion = opts.cniVersion || '0.3.1';
  const config = JSON.stringify({
    cniVersion,
    name: opts.name,
    type: 'bridge',
    bridge: opts.bridgeName,
    macspoofchk: opts.macspoofchk,
  });

  return {
    apiVersion: 'k8s.cni.cncf.io/v1',
    kind: 'NetworkAttachmentDefinition',
    metadata: {
      name: opts.name,
      namespace: opts.namespace,
      annotations: {
        'k8s.v1.cni.cncf.io/resourceName': `bridge.network.kubevirt.io/${opts.bridgeName}`,
      },
      labels: {
        'app.kubernetes.io/managed-by': MANAGED_BY_LABEL,
      },
    },
    spec: {
      config,
    },
  };
}

/**
 * Build a ClusterUserDefinedNetwork for an OVN localnet VLAN.
 */
export function buildOvnCudn(opts: {
  name: string;
  namespaceSelector: { matchLabels: Record<string, string> };
  physicalNetworkName: string;
  vlanID: number;
  mtu?: number;
  role?: string;
  subnets?: Array<{ cidr: string; gateway?: string }>;
}): ClusterUserDefinedNetworkKind {
  const localNet: CudnLocalNet = {
    physicalNetworkName: opts.physicalNetworkName,
    vlanID: opts.vlanID,
    role: opts.role || 'secondary',
  };

  if (opts.mtu && opts.mtu > 0) {
    localNet.mtu = opts.mtu;
  }

  if (opts.subnets && opts.subnets.length > 0) {
    localNet.subnets = opts.subnets.filter((s) => s.cidr);
  }

  return {
    apiVersion: 'k8s.ovn.org/v1',
    kind: 'ClusterUserDefinedNetwork',
    metadata: {
      name: opts.name,
      labels: {
        'app.kubernetes.io/managed-by': MANAGED_BY_LABEL,
      },
    },
    spec: {
      namespaceSelector: opts.namespaceSelector,
      network: {
        topology: 'localnet',
        localNet,
      },
    },
  };
}

/**
 * Parse NAD CNI config JSON to extract bridge name.
 */
function parseCniConfig(config: string | undefined): { bridge?: string; type?: string } {
  if (!config) return {};
  try {
    const parsed = JSON.parse(config);
    return { bridge: parsed.bridge, type: parsed.type };
  } catch {
    return {};
  }
}

/**
 * Combine NADs and CUDNs into a unified inventory list.
 */
export function listVlanInventory(
  nads: NetworkAttachmentDefinitionKind[],
  cudns: ClusterUserDefinedNetworkKind[],
): VlanInventoryItem[] {
  const items: VlanInventoryItem[] = [];

  for (const nad of nads) {
    const labels = nad.metadata.labels || {};
    if (labels['app.kubernetes.io/managed-by'] !== MANAGED_BY_LABEL) continue;
    const cni = parseCniConfig(nad.spec?.config);
    items.push({
      name: nad.metadata.name,
      namespace: nad.metadata.namespace,
      type: 'nad',
      bridgeName: cni.bridge,
    });
  }

  for (const cudn of cudns) {
    const labels = cudn.metadata.labels || {};
    if (labels['app.kubernetes.io/managed-by'] !== MANAGED_BY_LABEL) continue;
    const localNet = cudn.spec?.network?.localNet;
    items.push({
      name: cudn.metadata.name,
      namespace: '(cluster)',
      type: 'cudn',
      vlanId: localNet?.vlanID,
      physicalNetwork: localNet?.physicalNetworkName,
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

export function getK8sErrorMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const obj = err as {
    message?: string;
    json?: { message?: string; code?: number };
    status?: number;
  };
  return obj.json?.message || obj.message || String(err);
}

export function getK8sErrorCode(err: unknown): number | undefined {
  const obj = err as { json?: { code?: number }; status?: number; code?: number };
  return obj.json?.code ?? obj.status ?? obj.code;
}

export function isMissingCrdError(err: unknown): boolean {
  const code = getK8sErrorCode(err);
  if (code === 404) return true;
  const msg = getK8sErrorMessage(err).toLowerCase();
  return (
    msg.includes('could not find the requested resource') ||
    msg.includes('no matches for kind')
  );
}

export function isForbiddenError(err: unknown): boolean {
  const code = getK8sErrorCode(err);
  if (code === 403) return true;
  const msg = getK8sErrorMessage(err).toLowerCase();
  return msg.includes('forbidden') || msg.includes('cannot list resource');
}

export function suggestNetworkName(
  networkType: VlanNetworkType,
  bridgeOrLocalnet: string,
  vlanId: number | undefined,
): string {
  const vlanPart = vlanId ? `vlan${vlanId}` : 'vlan';
  const suffix = networkType === 'linux-bridge' ? 'linux-br' : 'cudn';
  const base = bridgeOrLocalnet
    ? `${vlanPart}-${bridgeOrLocalnet.replace(/[^a-z0-9-]/gi, '-')}-${suffix}`
    : `${vlanPart}-${suffix}`;
  return base.toLowerCase().replace(/--+/g, '-').replace(/^-|-$/g, '').slice(0, 253) || 'vlan-network';
}
