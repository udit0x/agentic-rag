import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  ArrowLeft, 
  User, 
  Mail, 
  Briefcase, 
  Calendar,
  LogOut,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
  role: string;
  joinedAt?: string;
}

interface ProfileScreenProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onUpdateRole?: (role: string) => void;
  onLogout?: () => void;
}

// Industry/Role options for the dropdown
const ROLE_OPTIONS = [
  "Technology",
  "Healthcare",
  "Finance",
  "Education",
  "Manufacturing",
  "Retail",
  "Consulting",
  "Marketing",
  "Real Estate",
  "Legal",
  "Non-profit",
  "Government",
  "Media & Entertainment",
  "Transportation",
  "Energy",
  "Other"
];

export function ProfileScreen({ 
  isOpen, 
  onClose, 
  userProfile, 
  onUpdateRole,
  onLogout 
}: ProfileScreenProps) {
  const [selectedRole, setSelectedRole] = useState(userProfile.role);
  const [hasChanges, setHasChanges] = useState(false);
  const isMobile = useIsMobile();

  const handleRoleChange = (newRole: string) => {
    setSelectedRole(newRole);
    setHasChanges(newRole !== userProfile.role);
  };

  const handleSaveRole = () => {
    if (hasChanges && onUpdateRole) {
      onUpdateRole(selectedRole);
      setHasChanges(false);
    }
  };

  const handleCancel = () => {
    setSelectedRole(userProfile.role);
    setHasChanges(false);
  };

  const handleLogout = () => {
    onLogout?.();
    onClose();
  };

  if (!isOpen) return null;

  const content = (
    <div className={cn(
      "flex flex-col h-full",
      isMobile ? "bg-background" : "bg-background border border-border rounded-lg shadow-lg"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between border-b border-border",
        isMobile ? "p-4" : "p-6"
      )}>
        <div className="flex items-center gap-3">
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h2 className="text-xl font-semibold">Profile</h2>
        </div>
        
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-9 w-9"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Content */}
      <div className={cn(
        "flex-1 overflow-y-auto",
        isMobile ? "p-4" : "p-6"
      )}>
        {isMobile ? (
          // Mobile Layout - Keep existing vertical layout
          <div className="space-y-6">
            {/* Profile Picture Section */}
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="h-24 w-24">
                <AvatarImage src={userProfile.avatar} alt={userProfile.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {userProfile.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="text-center">
                <h3 className="text-lg font-semibold">{userProfile.name}</h3>
                <p className="text-sm text-muted-foreground">{userProfile.email}</p>
              </div>
            </div>

            <Separator />

            {/* Profile Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Full Name
                  </Label>
                  <p className="text-sm text-muted-foreground pl-6">{userProfile.name}</p>
                  <p className="text-xs text-muted-foreground pl-6">Provided by Google Account</p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Address
                  </Label>
                  <p className="text-sm text-muted-foreground pl-6">{userProfile.email}</p>
                  <p className="text-xs text-muted-foreground pl-6">Provided by Google Account</p>
                </div>

                {userProfile.joinedAt && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Member Since
                    </Label>
                    <p className="text-sm text-muted-foreground pl-6">
                      {new Date(userProfile.joinedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Industry Settings</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Help us customize your experience
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Industry / Role
                  </Label>
                  <div className="space-y-2">
                    <Select value={selectedRole} onValueChange={handleRoleChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select your industry" />
                      </SelectTrigger>
                      <SelectContent className="z-[150]">
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Help us understand your industry to provide better assistance
                    </p>
                  </div>
                </div>

                {hasChanges && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveRole} className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Save Changes
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancel}>
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sign Out for Mobile */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          // Desktop Layout - Compact single card with profile picture in center
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Profile Picture Section */}
            <div className="flex justify-center">
              <Avatar className="h-24 w-24">
                <AvatarImage src={userProfile.avatar} alt={userProfile.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {userProfile.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Compact Information Card */}
            <Card>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  {/* Row 1: Name and Email */}
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Full Name</Label>
                    <p className="text-sm font-medium mt-1">{userProfile.name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Email Address</Label>
                    <p className="text-sm font-medium mt-1">{userProfile.email}</p>
                  </div>

                  {/* Row 2: Industry and Member Since */}
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Industry</Label>
                    <div className="mt-1">
                      <Select value={selectedRole} onValueChange={handleRoleChange}>
                        <SelectTrigger className="w-full h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          {ROLE_OPTIONS.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {hasChanges && (
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" onClick={handleSaveRole} className="h-7 text-xs">
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancel} className="h-7 text-xs">
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  {userProfile.joinedAt && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Member Since</Label>
                      <p className="text-sm font-medium mt-1">
                        {new Date(userProfile.joinedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Separator />

            {/* Centered Sign Out */}
            <div className="flex justify-center">
              <Button
                variant="destructive"
                onClick={handleLogout}
                className="flex items-center gap-2 px-8"
                size="lg"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    // Mobile: Full screen overlay
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-background"
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="h-full w-full"
          >
            {content}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Desktop: Modal overlay
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[90vh] overflow-hidden"
        >
          {content}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}