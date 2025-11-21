import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function TermsOfUse() {
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
          <h1 className="text-4xl font-bold text-foreground mb-2">Terms of Use</h1>
          <p className="text-muted-foreground mb-8">Last updated: November 15, 2025</p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Agreement to Terms</h2>
          <p className="text-foreground">
            Welcome to MindMesh! By accessing or using our service at{" "}
            <a href="https://mindmesh-ai.cloud/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              https://mindmesh-ai.cloud/
            </a>
            , you agree to be bound by these Terms of Use. If you do not agree with these terms, please do not use the service.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">About This Service</h2>
          <p className="text-foreground">
            MindMesh is a personal project that provides a multi-agent document intelligence platform. This is an experimental service provided "as-is" for educational and personal use purposes.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Use of Service</h2>
          <p className="text-foreground">You agree to:</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground">
            <li>Use the service only for lawful purposes</li>
            <li>Not upload malicious, illegal, or inappropriate content</li>
            <li>Not attempt to disrupt, damage, or gain unauthorized access to the service</li>
            <li>Not use the service to violate any applicable laws or regulations</li>
            <li>Respect the intellectual property rights of others</li>
          </ul>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Your Account</h2>
          <p className="text-foreground">
            You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Content and Data</h2>
          <p className="text-foreground">
            You retain ownership of any documents or content you upload to MindMesh. By uploading content, you grant us permission to process, store, and analyze it to provide the service. We recommend not uploading sensitive or confidential information.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Service Availability</h2>
          <p className="text-foreground">
            As a personal project, MindMesh is provided on a best-effort basis. We do not guarantee:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-foreground">
            <li>Continuous, uninterrupted access to the service</li>
            <li>That the service will be error-free or secure</li>
            <li>Permanent storage of your data</li>
            <li>Any specific uptime or performance levels</li>
          </ul>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Limitation of Liability</h2>
          <p className="text-foreground">
            This service is provided "as-is" without warranties of any kind, either express or implied. We are not liable for any damages arising from your use of the service, including but not limited to data loss, service interruptions, or errors in results.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Third-Party Services</h2>
          <p className="text-foreground">
            MindMesh may use third-party services (such as AI models, authentication providers, and cloud services). Your use of these services through MindMesh is subject to their respective terms and conditions.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Changes to Service</h2>
          <p className="text-foreground">
            We reserve the right to modify, suspend, or discontinue the service at any time without prior notice. We may also update these Terms of Use from time to time. Continued use of the service after changes constitutes acceptance of the new terms.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Termination</h2>
          <p className="text-foreground">
            We may terminate or suspend your access to the service at any time, without prior notice, for any reason, including violation of these terms. You may also stop using the service at any time.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Data Deletion</h2>
          <p className="text-foreground">
            You may request deletion of your account and associated data at any time by contacting us. We will make reasonable efforts to delete your data, subject to any legal obligations to retain certain information.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Governing Law</h2>
          <p className="text-foreground">
            These terms shall be governed by and construed in accordance with the laws of India. Any disputes arising from these terms or your use of the service shall be subject to the jurisdiction of the courts in Delhi, India.
          </p>

          <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">Contact</h2>
          <p className="text-foreground">
            If you have any questions about these Terms of Use, please contact us:
          </p>
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
              <strong>Note:</strong> MindMesh is a personal educational project. While we strive to provide a useful service, 
              we make no guarantees about its availability, accuracy, or suitability for any particular purpose. 
              Use at your own discretion.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
