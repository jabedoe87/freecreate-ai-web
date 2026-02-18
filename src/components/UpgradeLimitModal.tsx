import { Check, X } from "lucide-react";

interface UpgradeLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

const UpgradeLimitModal = ({ isOpen, onClose, onUpgrade }: UpgradeLimitModalProps) => {
  if (!isOpen) return null;

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Limit reached</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <p className="text-muted-foreground text-sm">
            You've used all <span className="text-foreground font-semibold">5 free generations</span> for this month.
            Upgrade to keep creating without limits.
          </p>

          {/* Comparison table */}
          <div className="rounded-xl border border-border overflow-hidden text-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Feature</th>
                  <th className="text-center px-3 py-2.5 text-muted-foreground font-medium">Free</th>
                  <th className="text-center px-3 py-2.5 text-primary font-semibold">Pro</th>
                  <th className="text-center px-3 py-2.5 text-muted-foreground font-medium">Bundle</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">Generations</td>
                  <td className="text-center px-3 py-3 text-muted-foreground">5 / mo</td>
                  <td className="text-center px-3 py-3 text-primary font-medium">Unlimited</td>
                  <td className="text-center px-3 py-3 text-muted-foreground">Unlimited</td>
                </tr>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-4 py-3 text-foreground">Premium templates</td>
                  <td className="text-center px-3 py-3">
                    <X className="w-4 h-4 text-destructive mx-auto" />
                  </td>
                  <td className="text-center px-3 py-3">
                    <Check className="w-4 h-4 text-primary mx-auto" />
                  </td>
                  <td className="text-center px-3 py-3">
                    <Check className="w-4 h-4 text-green-500 mx-auto" />
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">Exclusive packs</td>
                  <td className="text-center px-3 py-3">
                    <X className="w-4 h-4 text-destructive mx-auto" />
                  </td>
                  <td className="text-center px-3 py-3">
                    <X className="w-4 h-4 text-destructive mx-auto" />
                  </td>
                  <td className="text-center px-3 py-3">
                    <Check className="w-4 h-4 text-green-500 mx-auto" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-foreground hover:bg-muted/50 transition-colors text-sm font-medium"
          >
            Not now
          </button>
          <button
            onClick={onUpgrade}
            className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-sm font-semibold"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeLimitModal;
