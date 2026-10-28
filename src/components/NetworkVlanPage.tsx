import {
  K8sResourceCommon,
  DocumentTitle,
  ListPageHeader,
  k8sCreate,
  k8sDelete,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import {
  ActionGroup,
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardTitle,
  Checkbox,
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  MenuToggle,
  NumberInput,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Stack,
  StackItem,
  TextInput,
  Title,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { NetworkIcon, ExclamationCircleIcon, TrashIcon } from '@patternfly/react-icons';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';

import {
  NodeNetworkStateModel,
  NodeNetworkConfigurationPolicyModel,
  NetworkAttachmentDefinitionModel,
  ClusterUserDefinedNetworkModel,
  NamespaceModel,
} from '../utils/k8s-resources';
import {
  BridgeInfo,
  ClusterUserDefinedNetworkKind,
  NetworkAttachmentDefinitionKind,
  NncpKind,
  NodeNetworkStateKind,
  OvnLocalnetInfo,
  VlanInventoryItem,
  VlanNetworkType,
  NamespaceKind,
  buildLinuxBridgeNad,
  buildOvnCudn,
  discoverLinuxBridges,
  discoverOvnLocalnets,
  getK8sErrorMessage,
  isForbiddenError,
  isMissingCrdError,
  listVlanInventory,
  suggestNetworkName,
} from '../utils/network-vlan';
import { toYaml } from '../utils/yaml';
import dashboardLogger from '../utils/logger';
import CommunityDisclaimer from './CommunityDisclaimer';
import NmstateSetup, { useNmstateMissing } from './NmstateSetup';

import './network-vlan.css';

const LOG_ACTION = 'NETWORK_VLAN';

const NetworkVlanPage: FC = () => {
  const { t } = useTranslation('plugin__oct-network-vlan');
  const navigate = useNavigate();

  /* ---- K8s watches ---- */
  const [nnsList, nnsLoaded, nnsError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: NodeNetworkStateModel.apiGroup,
      version: NodeNetworkStateModel.apiVersion,
      kind: NodeNetworkStateModel.kind,
    },
    isList: true,
    namespaced: false,
  });

  const [nncpList, , nncpError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: NodeNetworkConfigurationPolicyModel.apiGroup,
      version: NodeNetworkConfigurationPolicyModel.apiVersion,
      kind: NodeNetworkConfigurationPolicyModel.kind,
    },
    isList: true,
    namespaced: false,
  });

  const [nadList, nadsLoaded, nadError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: NetworkAttachmentDefinitionModel.apiGroup,
      version: NetworkAttachmentDefinitionModel.apiVersion,
      kind: NetworkAttachmentDefinitionModel.kind,
    },
    isList: true,
    namespaced: true,
  });

  const [cudnList, cudnsLoaded, cudnError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: ClusterUserDefinedNetworkModel.apiGroup,
      version: ClusterUserDefinedNetworkModel.apiVersion,
      kind: ClusterUserDefinedNetworkModel.kind,
    },
    isList: true,
    namespaced: false,
  });

  const [nsList, nsLoaded] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: {
      group: '',
      version: NamespaceModel.apiVersion,
      kind: NamespaceModel.kind,
    },
    isList: true,
    namespaced: false,
  });

  /* ---- Derived data ---- */
  const nns = useMemo(() => (nnsList as NodeNetworkStateKind[]) || [], [nnsList]);
  const nncps = useMemo(() => (nncpList as NncpKind[]) || [], [nncpList]);
  const nads = useMemo(
    () => (nadList as unknown as NetworkAttachmentDefinitionKind[]) || [],
    [nadList],
  );
  const cudns = useMemo(
    () => (cudnList as unknown as ClusterUserDefinedNetworkKind[]) || [],
    [cudnList],
  );
  const namespaces = useMemo(
    () => ((nsList as unknown as NamespaceKind[]) || []).map((ns) => ns.metadata.name).sort(),
    [nsList],
  );

  const linuxBridges = useMemo(() => discoverLinuxBridges(nns), [nns]);
  const ovnLocalnets = useMemo(() => discoverOvnLocalnets(nncps), [nncps]);
  const inventory = useMemo(() => listVlanInventory(nads, cudns), [nads, cudns]);

  /* ---- Form state ---- */
  const [networkType, setNetworkType] = useState<VlanNetworkType>('linux-bridge');
  const [selectedBridge, setSelectedBridge] = useState('');
  const [selectedLocalnet, setSelectedLocalnet] = useState('');
  const [vlanId, setVlanId] = useState<number | undefined>(undefined);
  const [targetNamespace, setTargetNamespace] = useState('');
  const [networkName, setNetworkName] = useState('');
  const [macspoofchk, setMacspoofchk] = useState(false);
  const [mtu, setMtu] = useState(9000);
  const [role, setRole] = useState('secondary');
  const [subnetCidr, setSubnetCidr] = useState('');
  const [subnetGateway, setSubnetGateway] = useState('');
  const [nsSelectOpen, setNsSelectOpen] = useState(false);
  const [bridgeSelectOpen, setBridgeSelectOpen] = useState(false);
  const [localnetSelectOpen, setLocalnetSelectOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* ---- Auto-suggest network name ---- */
  useEffect(() => {
    const source = networkType === 'linux-bridge' ? selectedBridge : selectedLocalnet;
    const suggested = suggestNetworkName(networkType, source, vlanId);
    setNetworkName(suggested);
  }, [networkType, selectedBridge, selectedLocalnet, vlanId]);

  /* ---- Reset form fields when switching network type ---- */
  useEffect(() => {
    setSelectedBridge('');
    setSelectedLocalnet('');
    setVlanId(undefined);
    setTargetNamespace('');
    setCreateError(null);
    setCreateSuccess(null);
  }, [networkType]);

  /* ---- Navigation ---- */
  const goNetworkHub = useCallback(() => {
    navigate('/community-tools/network');
  }, [navigate]);

  /* ---- Create handler ---- */
  const handleCreate = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      if (networkType === 'linux-bridge') {
        const nad = buildLinuxBridgeNad({
          name: networkName.trim(),
          namespace: targetNamespace,
          bridgeName: selectedBridge,
          macspoofchk,
        });
        dashboardLogger.info(
          LOG_ACTION,
          'Creating NAD',
          `name=${nad.metadata.name} ns=${nad.metadata.namespace} bridge=${selectedBridge}`,
        );
        await k8sCreate({
          model: NetworkAttachmentDefinitionModel,
          data: nad as unknown as K8sResourceCommon,
          ns: targetNamespace,
        });
        setCreateSuccess(t('Created NAD {{name}} in {{namespace}}', {
          name: networkName.trim(),
          namespace: targetNamespace,
        }));
      } else {
        const subnets = subnetCidr.trim()
          ? [{ cidr: subnetCidr.trim(), gateway: subnetGateway.trim() || undefined }]
          : undefined;
        const cudn = buildOvnCudn({
          name: networkName.trim(),
          namespaceSelector: {
            matchLabels: { 'kubernetes.io/metadata.name': targetNamespace },
          },
          physicalNetworkName: selectedLocalnet,
          vlanID: vlanId || 0,
          mtu: mtu > 0 ? mtu : undefined,
          role,
          subnets,
        });
        dashboardLogger.info(
          LOG_ACTION,
          'Creating CUDN',
          `name=${cudn.metadata.name} localnet=${selectedLocalnet} vlanID=${vlanId}`,
        );
        await k8sCreate({
          model: ClusterUserDefinedNetworkModel,
          data: cudn as unknown as K8sResourceCommon,
        });
        setCreateSuccess(t('Created CUDN {{name}} for namespace {{namespace}}', {
          name: networkName.trim(),
          namespace: targetNamespace,
        }));
      }
      dashboardLogger.info(LOG_ACTION, 'Create succeeded', networkName.trim());
    } catch (err) {
      const msg = getK8sErrorMessage(err);
      dashboardLogger.error(LOG_ACTION, 'Create failed', msg);
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }, [
    networkType, networkName, targetNamespace, selectedBridge, selectedLocalnet,
    vlanId, macspoofchk, mtu, role, subnetCidr, subnetGateway, t,
  ]);

  /* ---- Delete handler ---- */
  const handleDelete = useCallback(
    async (item: VlanInventoryItem) => {
      setDeleting(item.name);
      setDeleteError(null);
      try {
        if (item.type === 'nad') {
          dashboardLogger.info(LOG_ACTION, 'Deleting NAD', `${item.namespace}/${item.name}`);
          await k8sDelete({
            model: NetworkAttachmentDefinitionModel,
            resource: {
              apiVersion: 'k8s.cni.cncf.io/v1',
              kind: 'NetworkAttachmentDefinition',
              metadata: { name: item.name, namespace: item.namespace },
            },
          });
        } else {
          dashboardLogger.info(LOG_ACTION, 'Deleting CUDN', item.name);
          await k8sDelete({
            model: ClusterUserDefinedNetworkModel,
            resource: {
              apiVersion: 'k8s.ovn.org/v1',
              kind: 'ClusterUserDefinedNetwork',
              metadata: { name: item.name },
            },
          });
        }
        dashboardLogger.info(LOG_ACTION, 'Delete succeeded', item.name);
      } catch (err) {
        const msg = getK8sErrorMessage(err);
        dashboardLogger.error(LOG_ACTION, 'Delete failed', msg);
        setDeleteError(`${item.name}: ${msg}`);
      } finally {
        setDeleting(null);
      }
    },
    [],
  );

  /* ---- Create another ---- */
  const handleCreateAnother = useCallback(() => {
    setCreateSuccess(null);
    setCreateError(null);
    setNetworkName(suggestNetworkName(networkType, '', undefined));
    setTargetNamespace('');
    setVlanId(undefined);
    setSelectedBridge('');
    setSelectedLocalnet('');
  }, [networkType]);

  /* ---- Validation ---- */
  const canCreate = useMemo(() => {
    if (!networkName.trim()) return false;
    if (!targetNamespace) return false;
    if (networkType === 'linux-bridge') {
      if (!selectedBridge) return false;
    } else {
      if (!selectedLocalnet) return false;
      if (!vlanId || vlanId < 1 || vlanId > 4094) return false;
    }
    return true;
  }, [networkType, networkName, targetNamespace, selectedBridge, selectedLocalnet, vlanId]);

  /* ---- Preview ---- */
  const previewContent = useMemo(() => {
    if (!canCreate) return '';
    if (networkType === 'linux-bridge') {
      const nad = buildLinuxBridgeNad({
        name: networkName.trim(),
        namespace: targetNamespace,
        bridgeName: selectedBridge,
        macspoofchk,
      });
      return toYaml({
        apiVersion: nad.apiVersion,
        kind: nad.kind,
        metadata: nad.metadata,
        spec: { config: nad.spec?.config },
      } as Record<string, unknown>);
    }
    const subnets = subnetCidr.trim()
      ? [{ cidr: subnetCidr.trim(), gateway: subnetGateway.trim() || undefined }]
      : undefined;
    const cudn = buildOvnCudn({
      name: networkName.trim(),
      namespaceSelector: {
        matchLabels: { 'kubernetes.io/metadata.name': targetNamespace },
      },
      physicalNetworkName: selectedLocalnet,
      vlanID: vlanId || 0,
      mtu: mtu > 0 ? mtu : undefined,
      role,
      subnets,
    });
    return toYaml(cudn as unknown as Record<string, unknown>);
  }, [
    canCreate, networkType, networkName, targetNamespace, selectedBridge,
    selectedLocalnet, vlanId, macspoofchk, mtu, role, subnetCidr, subnetGateway,
  ]);

  /* ---- Loading ---- */
  const nmstateMissing = useNmstateMissing();
  const ready = (nnsLoaded || Boolean(nnsError) || nmstateMissing) && (nadsLoaded || Boolean(nadError)) &&
    (cudnsLoaded || Boolean(cudnError)) && (nsLoaded);

  if (!ready) {
    return (
      <PageSection>
        <Bullseye>
          <Spinner size="xl" />
        </Bullseye>
      </PageSection>
    );
  }

  /* ---- Discovery errors ---- */
  const renderDiscoveryError = (): React.ReactNode => {
    if (nmstateMissing || (nnsError && isMissingCrdError(nnsError))) {
      return <NmstateSetup missing />;
    }
    if (nnsError && isForbiddenError(nnsError)) {
      return (
        <EmptyState
          titleText={t('You do not have permission to list NodeNetworkState resources.')}
          icon={ExclamationCircleIcon}
          headingLevel="h2"
        >
          <EmptyStateBody>{getK8sErrorMessage(nnsError)}</EmptyStateBody>
        </EmptyState>
      );
    }
    if (nnsError) {
      return (
        <Alert variant="danger" title={t('Failed to load NodeNetworkState')} isInline>
          {getK8sErrorMessage(nnsError)}
        </Alert>
      );
    }
    return null;
  };

  const discoveryError = renderDiscoveryError();

  return (
    <>
      <DocumentTitle>{t('Network VLAN')}</DocumentTitle>

      <PageSection type="breadcrumb">
        <Breadcrumb>
          <BreadcrumbItem
            component="a"
            onClick={(e) => {
              e.preventDefault();
              goNetworkHub();
            }}
          >
            {t('Network')}
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{t('Network VLAN')}</BreadcrumbItem>
        </Breadcrumb>
      </PageSection>

      <ListPageHeader title={t('Network VLAN')} />

      <PageSection>
        <Stack hasGutter>
          <StackItem>
            <CommunityDisclaimer />
          </StackItem>

          <StackItem>
            <p className="netvlan-lead">
              {t('Create VLAN networks from discovered Linux bridges or OVN localnets. Generates NetworkAttachmentDefinitions (NADs) for Linux bridges or ClusterUserDefinedNetworks (CUDNs) for OVN localnet topology.')}
            </p>
          </StackItem>

          {discoveryError && <StackItem>{discoveryError}</StackItem>}

          {nncpError && (
            <StackItem>
              <Alert variant="warning" title={t('Could not list NodeNetworkConfigurationPolicies')} isInline>
                {t('OVN bridge-mapping discovery may be incomplete.')} {getK8sErrorMessage(nncpError)}
              </Alert>
            </StackItem>
          )}

          {nadError && (
            <StackItem>
              <Alert variant="warning" title={t('Could not list NetworkAttachmentDefinitions')} isInline>
                {getK8sErrorMessage(nadError)}
              </Alert>
            </StackItem>
          )}

          {cudnError && (
            <StackItem>
              <Alert variant="warning" title={t('Could not list ClusterUserDefinedNetworks')} isInline>
                {getK8sErrorMessage(cudnError)}
              </Alert>
            </StackItem>
          )}

          {/* Section A: Existing VLAN Networks */}
          <StackItem>
            <Card>
              <CardTitle>
                <Title headingLevel="h2">{t('Existing VLAN Networks')}</Title>
              </CardTitle>
              <CardBody>
                {inventory.length === 0 ? (
                  <EmptyState
                    titleText={t('No VLAN networks found')}
                    icon={NetworkIcon}
                    headingLevel="h3"
                  >
                    <EmptyStateBody>
                      {t('No NADs or CUDNs managed by this tool were found. Create one below.')}
                    </EmptyStateBody>
                  </EmptyState>
                ) : (
                  <Stack hasGutter>
                    {deleteError && (
                      <StackItem>
                        <Alert variant="danger" title={t('Failed to delete')} isInline>
                          {deleteError}
                        </Alert>
                      </StackItem>
                    )}
                    <StackItem>
                      <div className="netvlan-table-wrap">
                        <Table aria-label={t('Existing VLAN Networks')} variant="compact">
                          <Thead>
                            <Tr>
                              <Th>{t('Name')}</Th>
                              <Th>{t('Namespace')}</Th>
                              <Th>{t('Type')}</Th>
                              <Th>{t('Bridge / Localnet')}</Th>
                              <Th>{t('VLAN ID')}</Th>
                              <Th screenReaderText={t('Actions')} />
                            </Tr>
                          </Thead>
                          <Tbody>
                            {inventory.map((item) => (
                              <Tr key={`${item.type}-${item.namespace}-${item.name}`}>
                                <Td dataLabel={t('Name')}>{item.name}</Td>
                                <Td dataLabel={t('Namespace')}>{item.namespace}</Td>
                                <Td dataLabel={t('Type')}>
                                  {item.type === 'nad'
                                    ? t('Linux Bridge NAD')
                                    : t('OVN Localnet CUDN')}
                                </Td>
                                <Td dataLabel={t('Bridge / Localnet')}>
                                  {item.bridgeName || item.physicalNetwork || '—'}
                                </Td>
                                <Td dataLabel={t('VLAN ID')}>
                                  {item.vlanId !== undefined ? String(item.vlanId) : '—'}
                                </Td>
                                <Td isActionCell>
                                  <Button
                                    variant="plain"
                                    aria-label={t('Delete {{name}}', { name: item.name })}
                                    onClick={() => handleDelete(item)}
                                    isDisabled={deleting === item.name}
                                    isLoading={deleting === item.name}
                                    icon={<TrashIcon />}
                                  />
                                </Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </div>
                    </StackItem>
                  </Stack>
                )}
              </CardBody>
            </Card>
          </StackItem>

          {/* Section B: Create VLAN Network */}
          {!discoveryError && (
            <StackItem>
              <Card>
                <CardTitle>
                  <Title headingLevel="h2">{t('Create VLAN Network')}</Title>
                </CardTitle>
                <CardBody>
                  <Form>
                    <FormGroup label={t('Network Type')} fieldId="netvlan-type" isRequired>
                      <ToggleGroup aria-label={t('Network Type')}>
                        <ToggleGroupItem
                          text={t('Linux Bridge VLAN')}
                          buttonId="netvlan-type-linux"
                          isSelected={networkType === 'linux-bridge'}
                          onChange={() => setNetworkType('linux-bridge')}
                        />
                        <ToggleGroupItem
                          text={t('OVN Localnet VLAN')}
                          buttonId="netvlan-type-ovn"
                          isSelected={networkType === 'ovn-localnet'}
                          onChange={() => setNetworkType('ovn-localnet')}
                        />
                      </ToggleGroup>
                    </FormGroup>

                    {/* Linux Bridge fields */}
                    {networkType === 'linux-bridge' && (
                      <>
                        <FormGroup label={t('Bridge')} fieldId="netvlan-bridge" isRequired>
                          <Select
                            id="netvlan-bridge"
                            isOpen={bridgeSelectOpen}
                            onOpenChange={setBridgeSelectOpen}
                            onSelect={(_e, value) => {
                              setSelectedBridge(value as string);
                              setBridgeSelectOpen(false);
                            }}
                            selected={selectedBridge}
                            toggle={(toggleRef) => (
                              <MenuToggle
                                ref={toggleRef}
                                onClick={() => setBridgeSelectOpen(!bridgeSelectOpen)}
                                isExpanded={bridgeSelectOpen}
                                style={{ width: '100%' }}
                              >
                                {selectedBridge || t('Select a bridge')}
                              </MenuToggle>
                            )}
                          >
                            <SelectList>
                              {linuxBridges.map((br: BridgeInfo) => (
                                <SelectOption
                                  key={br.name}
                                  value={br.name}
                                  description={t('{{count}} nodes', { count: String(br.nodes.length) })}
                                >
                                  {br.name}
                                </SelectOption>
                              ))}
                              {linuxBridges.length === 0 && (
                                <SelectOption isDisabled value="">
                                  {t('No Linux bridges found')}
                                </SelectOption>
                              )}
                            </SelectList>
                          </Select>
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('Select a discovered Linux bridge from NodeNetworkState.')}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>

                        <FormGroup label={t('MAC Spoof Check')} fieldId="netvlan-macspoofchk">
                          <Checkbox
                            id="netvlan-macspoofchk"
                            label={t('Enable MAC spoof checking')}
                            isChecked={macspoofchk}
                            onChange={(_e, checked) => setMacspoofchk(checked)}
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('Disable for KubeVirt VM compatibility (default off).')}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>
                      </>
                    )}

                    {/* OVN Localnet fields */}
                    {networkType === 'ovn-localnet' && (
                      <>
                        <FormGroup label={t('Physical Network / Localnet')} fieldId="netvlan-localnet" isRequired>
                          <Select
                            id="netvlan-localnet"
                            isOpen={localnetSelectOpen}
                            onOpenChange={setLocalnetSelectOpen}
                            onSelect={(_e, value) => {
                              setSelectedLocalnet(value as string);
                              setLocalnetSelectOpen(false);
                            }}
                            selected={selectedLocalnet}
                            toggle={(toggleRef) => (
                              <MenuToggle
                                ref={toggleRef}
                                onClick={() => setLocalnetSelectOpen(!localnetSelectOpen)}
                                isExpanded={localnetSelectOpen}
                                style={{ width: '100%' }}
                              >
                                {selectedLocalnet || t('Select a localnet')}
                              </MenuToggle>
                            )}
                          >
                            <SelectList>
                              {ovnLocalnets.map((ln: OvnLocalnetInfo) => (
                                <SelectOption
                                  key={ln.localnetName}
                                  value={ln.localnetName}
                                  description={`${t('Bridge')}: ${ln.bridgeName}`}
                                >
                                  {ln.localnetName}
                                </SelectOption>
                              ))}
                              {ovnLocalnets.length === 0 && (
                                <SelectOption isDisabled value="">
                                  {t('No OVN bridge-mappings found in NNCPs')}
                                </SelectOption>
                              )}
                            </SelectList>
                          </Select>
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>
                                {t('Discovered from ovn.bridge-mappings in NodeNetworkConfigurationPolicies.')}
                              </HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>

                        <FormGroup label={t('VLAN ID')} fieldId="netvlan-vlanid" isRequired>
                          <NumberInput
                            id="netvlan-vlanid"
                            value={vlanId ?? 0}
                            min={1}
                            max={4094}
                            onChange={(e) => {
                              const val = parseInt((e.target as HTMLInputElement).value, 10);
                              setVlanId(isNaN(val) ? undefined : val);
                            }}
                            onMinus={() => setVlanId(Math.max(1, (vlanId || 1) - 1))}
                            onPlus={() => setVlanId(Math.min(4094, (vlanId || 0) + 1))}
                            widthChars={6}
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>{t('VLAN ID (1–4094).')}</HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>

                        <FormGroup label={t('MTU')} fieldId="netvlan-mtu">
                          <NumberInput
                            id="netvlan-mtu"
                            value={mtu}
                            min={576}
                            max={9216}
                            onChange={(e) => {
                              const val = parseInt((e.target as HTMLInputElement).value, 10);
                              setMtu(isNaN(val) ? 9000 : val);
                            }}
                            onMinus={() => setMtu(Math.max(576, mtu - 100))}
                            onPlus={() => setMtu(Math.min(9216, mtu + 100))}
                            widthChars={6}
                          />
                          <FormHelperText>
                            <HelperText>
                              <HelperTextItem>{t('Maximum transmission unit (default 9000).')}</HelperTextItem>
                            </HelperText>
                          </FormHelperText>
                        </FormGroup>

                        <FormGroup label={t('Role')} fieldId="netvlan-role">
                          <FormSelect
                            id="netvlan-role"
                            value={role}
                            onChange={(_e, value) => setRole(value)}
                          >
                            <FormSelectOption value="secondary" label={t('Secondary')} />
                            <FormSelectOption value="primary" label={t('Primary')} />
                          </FormSelect>
                        </FormGroup>

                        <FormGroup label={t('Subnet CIDR (optional)')} fieldId="netvlan-subnet-cidr">
                          <TextInput
                            id="netvlan-subnet-cidr"
                            value={subnetCidr}
                            onChange={(_e, value) => setSubnetCidr(value)}
                            placeholder="10.0.0.0/24"
                          />
                        </FormGroup>

                        <FormGroup label={t('Subnet Gateway (optional)')} fieldId="netvlan-subnet-gw">
                          <TextInput
                            id="netvlan-subnet-gw"
                            value={subnetGateway}
                            onChange={(_e, value) => setSubnetGateway(value)}
                            placeholder="10.0.0.1"
                          />
                        </FormGroup>
                      </>
                    )}

                    {/* Common fields */}
                    <FormGroup label={t('Target Namespace')} fieldId="netvlan-namespace" isRequired>
                      <Select
                        id="netvlan-namespace"
                        isOpen={nsSelectOpen}
                        onOpenChange={setNsSelectOpen}
                        onSelect={(_e, value) => {
                          setTargetNamespace(value as string);
                          setNsSelectOpen(false);
                        }}
                        selected={targetNamespace}
                        toggle={(toggleRef) => (
                          <MenuToggle
                            ref={toggleRef}
                            onClick={() => setNsSelectOpen(!nsSelectOpen)}
                            isExpanded={nsSelectOpen}
                            style={{ width: '100%' }}
                          >
                            {targetNamespace || t('Select a namespace')}
                          </MenuToggle>
                        )}
                      >
                        <SelectList>
                          {namespaces.map((ns) => (
                            <SelectOption key={ns} value={ns}>
                              {ns}
                            </SelectOption>
                          ))}
                        </SelectList>
                      </Select>
                    </FormGroup>

                    <FormGroup label={t('Network Name')} fieldId="netvlan-name" isRequired>
                      <TextInput
                        id="netvlan-name"
                        value={networkName}
                        onChange={(_e, value) => setNetworkName(value)}
                      />
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem>
                            {t('Auto-suggested from bridge/localnet and VLAN ID. Editable.')}
                          </HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    </FormGroup>
                  </Form>
                </CardBody>
              </Card>
            </StackItem>
          )}

          {/* Section C: Review + Create */}
          {!discoveryError && (
            <StackItem>
              <Card>
                <CardTitle>
                  <Title headingLevel="h2">{t('Review & Create')}</Title>
                </CardTitle>
                <CardBody>
                  <Stack hasGutter>
                    <StackItem>
                      <DescriptionList isHorizontal columnModifier={{ default: '2Col' }}>
                        <DescriptionListGroup>
                          <DescriptionListTerm>{t('Network Type')}</DescriptionListTerm>
                          <DescriptionListDescription>
                            {networkType === 'linux-bridge'
                              ? t('Linux Bridge VLAN')
                              : t('OVN Localnet VLAN')}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                          <DescriptionListTerm>
                            {networkType === 'linux-bridge' ? t('Bridge') : t('Localnet')}
                          </DescriptionListTerm>
                          <DescriptionListDescription>
                            {(networkType === 'linux-bridge'
                              ? selectedBridge
                              : selectedLocalnet) || '—'}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        {networkType === 'ovn-localnet' && (
                          <DescriptionListGroup>
                            <DescriptionListTerm>{t('VLAN ID')}</DescriptionListTerm>
                            <DescriptionListDescription>
                              {vlanId !== undefined ? String(vlanId) : '—'}
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        )}
                        <DescriptionListGroup>
                          <DescriptionListTerm>{t('Target Namespace')}</DescriptionListTerm>
                          <DescriptionListDescription>
                            {targetNamespace || '—'}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                          <DescriptionListTerm>{t('Network Name')}</DescriptionListTerm>
                          <DescriptionListDescription>
                            {networkName || '—'}
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                        {networkType === 'linux-bridge' && (
                          <DescriptionListGroup>
                            <DescriptionListTerm>{t('MAC Spoof Check')}</DescriptionListTerm>
                            <DescriptionListDescription>
                              {macspoofchk ? t('Enabled') : t('Disabled')}
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        )}
                        {networkType === 'ovn-localnet' && (
                          <>
                            <DescriptionListGroup>
                              <DescriptionListTerm>{t('MTU')}</DescriptionListTerm>
                              <DescriptionListDescription>
                                {String(mtu)}
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                              <DescriptionListTerm>{t('Role')}</DescriptionListTerm>
                              <DescriptionListDescription>
                                {role}
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                          </>
                        )}
                      </DescriptionList>
                    </StackItem>

                    {previewContent && (
                      <StackItem>
                        <Title headingLevel="h3">{t('YAML Preview')}</Title>
                        <div className="netvlan-review-yaml">
                          <CodeBlock>
                            <CodeBlockCode>{previewContent}</CodeBlockCode>
                          </CodeBlock>
                        </div>
                      </StackItem>
                    )}

                    {createError && (
                      <StackItem>
                        <Alert variant="danger" title={t('Failed to create VLAN network')} isInline>
                          {createError}
                        </Alert>
                      </StackItem>
                    )}

                    {createSuccess && (
                      <StackItem>
                        <Alert variant="success" title={t('VLAN network created')} isInline>
                          {createSuccess}
                        </Alert>
                      </StackItem>
                    )}

                    <StackItem>
                      <div className="netvlan-actions">
                        <ActionGroup>
                          <Button
                            variant="primary"
                            onClick={handleCreate}
                            isDisabled={creating || !canCreate || Boolean(createSuccess)}
                            isLoading={creating}
                          >
                            {creating ? t('Creating...') : t('Create')}
                          </Button>
                          {createSuccess && (
                            <Button variant="secondary" onClick={handleCreateAnother}>
                              {t('Create another')}
                            </Button>
                          )}
                          <Button variant="link" onClick={goNetworkHub}>
                            {t('Back to Network')}
                          </Button>
                        </ActionGroup>
                      </div>
                    </StackItem>
                  </Stack>
                </CardBody>
              </Card>
            </StackItem>
          )}
        </Stack>
      </PageSection>
    </>
  );
};

export default NetworkVlanPage;
