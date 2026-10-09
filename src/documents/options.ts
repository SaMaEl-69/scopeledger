import type { DocumentSections } from '../domain/types';
export const defaultSections = (): DocumentSections => ({
  agencyLogo: true,
  contactDetails: true,
  exclusions: true,
  dependencies: true,
  assumptions: true,
  delivery: true,
  footer: true,
});
