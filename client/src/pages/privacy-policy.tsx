import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function PrivacyPolicy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      </header>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto px-6 py-12"
      >
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: November 15, 2025</p>

          <p className="text-foreground">
            This Privacy Policy explains how MindMesh, a personal educational project, collects, uses, and protects your information when you use our service at{" "}
            <a href="https://mindmesh-ai.cloud/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              https://mindmesh-ai.cloud/
            </a>
            . By using MindMesh, you agree to the practices described in this policy.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">About This Service</h2>
          <p className="text-foreground">
            MindMesh is a personal project, not a commercial entity. We take your privacy seriously but operate on a best-effort basis as an experimental platform.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Information We Collect</h2>
          
          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Account Information</h3>
          <p className="text-foreground">
            When you create an account, we collect:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-foreground">
            <li>Email address (via authentication provider)</li>
            <li>Name or display name</li>
            <li>Profile information from your authentication provider (Google, email, etc.)</li>
          </ul>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Content You Upload</h3>
          <p className="text-foreground">
            When you use MindMesh, we store:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-foreground">
            <li>Documents you upload for processing</li>
            <li>Chat messages and conversation history</li>
            <li>AI-generated responses and analysis</li>
          </ul>

          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Automatic Information</h3>
          <p className="text-foreground">
            We automatically collect basic usage data including IP addresses, browser type, access times, and pages visited for troubleshooting and improvement purposes.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">How We Use Your Information</h2>
          <p className="text-foreground">We use your information to:</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground">
            <li>Provide the document intelligence service</li>
            <li>Maintain your account and conversation history</li>
            <li>Process and analyze your uploaded documents</li>
            <li>Improve the service and fix bugs</li>
            <li>Send important service updates (if necessary)</li>
          </ul>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Third-Party Services</h2>
          <p className="text-foreground">
            MindMesh uses third-party services that may collect and process your data:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-foreground">
            <li>Authentication providers (Clerk/Google/GitHub) - for account management</li>
            <li>Cloud hosting (Azure) - for infrastructure</li>
            <li>AI services (Azure OpenAI) - for document processing and chat responses</li>
          </ul>
          <p className="text-foreground mt-2">
            These services have their own privacy policies and we have no control over how they handle your data.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Data Security</h2>
          <p className="text-foreground">
            We take reasonable measures to protect your data, but as a personal project with limited resources, we cannot guarantee absolute security. We recommend not uploading highly sensitive or confidential documents.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Data Retention</h2>
          <p className="text-foreground">
            Your data is stored as long as your account is active. You may request deletion of your account and associated data at any time by contacting us. Note that backups may retain data for a limited period.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Children's Privacy</h2>
          <p className="text-foreground">
            While our Service does not specifically target children under the age of 13, we do not currently implement age verification mechanisms. If you are a parent or guardian and believe your child has provided us with personal information, please contact us, and we will take steps to remove that information from our servers.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Changes to this Privacy Policy</h2>
          <p className="text-foreground">
            We may update Our Privacy Policy from time to time. We will notify You of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date at the top of this Privacy Policy.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Your Rights</h2>
          <p className="text-foreground">You have the right to:</p>
          <ul className="list-disc pl-6 space-y-1 text-foreground">
            <li>Access your personal data</li>
            <li>Request correction of your data</li>
            <li>Request deletion of your account and data</li>
            <li>Export your data (chat history, uploaded documents) - By Contacting us</li>
          </ul>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Contact Us</h2>
          <p className="text-foreground">If you have any questions about this Privacy Policy or want to exercise your rights, contact us:</p>
          <ul className="list-disc pl-6 space-y-1 text-foreground">
            <li>
              By email:{" "}
              <a href="mailto:uditkashyap29@gmail.com" className="text-primary hover:underline">
                uditkashyap29@gmail.com
              </a>
            </li>
            <li>
              By visiting:{" "}
              <a href="https://linkedin.com/in/uditkashyap" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                linkedin.com/in/uditkashyap
              </a>
            </li>
          </ul>

          <div className="mt-12 p-6 bg-muted/50 rounded-lg border border-border">
            <p className="text-sm text-muted-foreground italic">
              <strong>Note:</strong> MindMesh is a personal educational project. While we strive to protect your privacy, 
              this is not a commercial service with dedicated security teams. Please use discretion when uploading documents 
              and don't share highly sensitive or confidential information.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
