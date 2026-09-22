import { K8sModel } from '@openshift-console/dynamic-plugin-sdk';

/** Cluster-scoped NMState report of a node's live interfaces. */
export const NodeNetworkStateModel: K8sModel = {
  apiVersion: 'v1beta1',
  apiGroup: 'nmstate.io',
  kind: 'NodeNetworkState',
  abbr: 'NNS',
  label: 'NodeNetworkState',
  labelPlural: 'NodeNetworkStates',
  plural: 'nodenetworkstates',
  namespaced: false,
};

/** Namespaced Multus network attachment. */
export const NetworkAttachmentDefinitionModel: K8sModel = {
  apiVersion: 'v1',
  apiGroup: 'k8s.cni.cncf.io',
  kind: 'NetworkAttachmentDefinition',
  abbr: 'NAD',
  label: 'NetworkAttachmentDefinition',
  labelPlural: 'NetworkAttachmentDefinitions',
  plural: 'network-attachment-definitions',
  namespaced: true,
};

/** Cluster-scoped OVN user-defined network. */
export const ClusterUserDefinedNetworkModel: K8sModel = {
  apiVersion: 'v1',
  apiGroup: 'k8s.ovn.org',
  kind: 'ClusterUserDefinedNetwork',
  abbr: 'CUDN',
  label: 'ClusterUserDefinedNetwork',
  labelPlural: 'ClusterUserDefinedNetworks',
  plural: 'clusteruserdefinednetworks',
  namespaced: false,
};

/** Core v1 Namespace. */
export const NamespaceModel: K8sModel = {
  apiVersion: 'v1',
  kind: 'Namespace',
  abbr: 'NS',
  label: 'Namespace',
  labelPlural: 'Namespaces',
  plural: 'namespaces',
  namespaced: false,
};

/** Cluster-scoped NMState desired-state policy (for reading OVN bridge-mappings). */
export const NodeNetworkConfigurationPolicyModel: K8sModel = {
  apiVersion: 'v1',
  apiGroup: 'nmstate.io',
  kind: 'NodeNetworkConfigurationPolicy',
  abbr: 'NNCP',
  label: 'NodeNetworkConfigurationPolicy',
  labelPlural: 'NodeNetworkConfigurationPolicies',
  plural: 'nodenetworkconfigurationpolicies',
  namespaced: false,
};
