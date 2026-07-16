import type {
  CaptureTarget,
  ManualDraft,
  ManualStepHierarchy,
  ManualStepGuide,
  SelectedElementData,
  SelectionRect,
  ViewportData,
} from '../manual-builder';

export type SelectionHighlightMode = 'auto' | 'always' | 'never';
export type ManualPdfOrientation = 'landscape' | 'portrait';
export type ManualPdfStage =
  | 'preparing'
  | 'loading-fonts'
  | 'cover'
  | 'step'
  | 'saving'
  | 'completed';

export interface ManualPdfTheme {
  primaryRed: string;
  deepRed: string;
  gold: string;
  green: string;
  warmWhite: string;
  white: string;
  darkText: string;
  mutedText: string;
  softBorder: string;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  fontSizeBody: number;
  fontSizeSmall: number;
  fontSizeTitle: number;
}

export interface ManualAssetResolver {
  getDataUrl(assetId: string): Promise<string | undefined>;
}

export interface ManualPdfBrandingLayout {
  headerWidth: number;
  headerHeight: number;
  footerWidth: number;
  footerHeight: number;
  footerOffsetY: number;
  contentGap: number;
}

export interface ManualPdfOptions {
  orientation?: ManualPdfOrientation;
  includeCover?: boolean;
  drawSelectionHighlight?: SelectionHighlightMode;
  imageQuality?: number;
  maxImageDimension?: number;
  fileName?: string;
  headerImageDataUrl?: string | null;
  footerImageDataUrl?: string | null;
  portraitBrandingLayout?: Partial<ManualPdfBrandingLayout>;
  fontUrls?: {
    regular?: string;
    bold?: string;
  };
  theme?: Partial<ManualPdfTheme>;
  assetResolver?: ManualAssetResolver;
  onProgress?: (progress: ManualPdfProgress) => void;
}

export interface ManualPdfProgress {
  current: number;
  total: number;
  percentage: number;
  stage: ManualPdfStage;
  message: string;
}

export interface CompatibleSelectedElement extends Partial<SelectedElementData> {
  rect?: SelectionRect;
  viewport?: ViewportData;
  title?: string | null;
}

export interface CompatibleManualStep {
  id?: string;
  order?: number;
  title?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
  pageTitle?: string;
  selector?: string;
  imageOriginalDataUrl?: string;
  imageDataUrl?: string;
  screenshotDataUrl?: string;
  imageContextDataUrl?: string;
  contextImageDataUrl?: string;
  imageAssetId?: string;
  contextImageAssetId?: string;
  contextRegion?: SelectionRect;
  selectedElement?: CompatibleSelectedElement;
  rect?: SelectionRect;
  viewport?: ViewportData;
  captureTarget?: CaptureTarget;
  annotationBaked?: boolean;
  guide?: ManualStepGuide;
  hierarchy?: Partial<ManualStepHierarchy>;
}

export interface ManualSystemStructure {
  systemName: string;
  modules: Array<{
    name: string;
    actions: Array<{
      name: string;
      manuals: Array<{
        title: string;
        stepCount: number;
      }>;
    }>;
  }>;
}

export interface ManualExport extends Partial<Omit<ManualDraft, 'steps'>> {
  steps: readonly CompatibleManualStep[];
  structure?: ManualSystemStructure;
}

export interface ResolvedManualStep {
  id: string;
  order: number;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  pageTitle: string;
  selector: string;
  imageOriginalDataUrl: string | undefined;
  imageContextDataUrl: string | undefined;
  imageAssetId: string | undefined;
  contextImageAssetId: string | undefined;
  contextRegion: SelectionRect | undefined;
  selectedElement: CompatibleSelectedElement;
  captureTarget: CaptureTarget | undefined;
  annotationBaked: boolean | undefined;
  guide: ManualStepGuide | undefined;
  hierarchy: ManualStepHierarchy | undefined;
}

export interface ResolvedManual {
  title: string;
  description: string;
  author: string;
  createdAt: string;
  steps: ResolvedManualStep[];
  structure: ManualSystemStructure | undefined;
}

export interface ResolvedStepContent {
  title: string;
  summary: string;
  actions: string[];
  expectedResult: string;
  detailCaption: string;
  resource: string;
}

export interface ImagePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ProcessedImage extends ImageDimensions {
  bytes: Uint8Array;
  format: 'jpeg' | 'png';
}
