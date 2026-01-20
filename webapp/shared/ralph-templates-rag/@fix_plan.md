# RAG Knowledge Base Extraction Plan

## Phase 1: Document Analysis
- [ ] Inventory all source documents in docs/
- [ ] Identify document types (PDF, Excel, images, text)
- [ ] Identify critical numerical data (prices, quantities, dates)
- [ ] Create extraction priority list
- [ ] Map document relationships

## Phase 2: Core Business Information
- [ ] Extract company/organization general info
- [ ] Extract mission, vision, values (if present)
- [ ] Extract history and background
- [ ] Extract contact information (addresses, phones, emails)
- [ ] Extract operating hours and schedules

## Phase 3: Products/Services Catalog
- [ ] Extract product/service categories
- [ ] Extract individual product/service details
- [ ] Extract specifications and features
- [ ] Extract availability information

## Phase 4: Pricing Information (CRITICAL - VERIFY ALL NUMBERS)
- [ ] Extract base prices for all products/services
- [ ] Extract promotional prices and discounts
- [ ] Extract pricing tiers or plans
- [ ] Extract payment terms and conditions
- [ ] CROSS-CHECK all prices against source documents

## Phase 5: Policies and Procedures
- [ ] Extract return/refund policies
- [ ] Extract warranty information
- [ ] Extract terms of service
- [ ] Extract privacy policies
- [ ] Extract shipping/delivery policies

## Phase 6: FAQ and Common Questions
- [ ] Extract existing FAQs from documents
- [ ] Identify implicit FAQ from content patterns
- [ ] Organize by topic/category

## Phase 7: Supplementary Information
- [ ] Extract location/branch details
- [ ] Extract team/staff information (if public)
- [ ] Extract certifications and accreditations
- [ ] Extract partnerships and integrations

## Phase 8: Quality Verification (CRITICAL)
- [ ] Verify ALL prices match source documents
- [ ] Verify ALL dates and schedules are correct
- [ ] Verify ALL phone numbers and emails
- [ ] Verify YAML frontmatter on all files
- [ ] Verify directory structure is organized
- [ ] Verify file naming is consistent
- [ ] Remove duplicate information
- [ ] Check cross-references between files

## Completion Criteria
All phases complete when:
- Every source document has been processed
- All numerical data is 100% accurate (verified)
- Every output file has valid YAML frontmatter
- Directory structure follows 01-XX/ naming convention
- Each file covers ONE topic, max 500 words
- No duplicate information across files
