import { useEffect, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, SegmentedButtons, Text, Card, Icon, Divider } from "react-native-paper";
import { fetchCashSessions, reviewCashSession, fetchShops, DetailedCashSession } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ShopPicker } from "../../components/ui/ShopPicker";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

export function CashClosingReview() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const [shopId, setShopId] = useState<string | undefined>();
  const [filter, setFilter] = useState("pending");

  const shopsQuery = useQuery({
    queryKey: ["shops"],
    queryFn: () => fetchShops(token ?? ""),
    enabled: !!token,
  });

  useEffect(() => {
    if (!shopId && shopsQuery.data?.[0]) {
      setShopId(shopsQuery.data[0].id);
    }
  }, [shopId, shopsQuery.data]);

  const sessionsQuery = useQuery({
    queryKey: ["cash-sessions", shopId],
    queryFn: () => fetchCashSessions(token ?? "", shopId ?? ""),
    enabled: !!token && !!shopId,
  });

  const reviewMutation = useMutation({
    mutationFn: (sessionId: string) => reviewCashSession(token ?? "", sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-sessions", shopId] });
      queryClient.invalidateQueries({ queryKey: ["shops"] });
    },
  });

  const filteredSessions = sessionsQuery.data?.filter((session) => {
    if (filter === "pending") {
      return session.status === "CLOSED";
    } else {
      return session.status === "REVIEWED" || session.status === "LOCKED";
    }
  }) ?? [];

  const pendingCount = sessionsQuery.data?.filter(s => s.status === 'CLOSED').length ?? 0;

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Closing Review"
        subtitle={`${pendingCount} sessions awaiting executive approval.`}
      />

      <View className="px-4 py-3 bg-white border-b border-gray-100">
         <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />
      </View>

      <View className="px-4 py-2 bg-gray-50 flex-row items-center justify-between">
         <View className="flex-row gap-4">
            <Pressable onPress={() => setFilter("pending")} className="pb-2 items-center border-b-2" style={{ borderBottomColor: filter === "pending" ? "#1e40af" : "transparent" }}>
              <Text style={{ fontWeight: "700", color: filter === "pending" ? "#1e40af" : "#9ca3af", fontSize: 13 }}>PENDING</Text>
            </Pressable>
            <Pressable onPress={() => setFilter("reviewed")} className="pb-2 items-center border-b-2" style={{ borderBottomColor: filter === "reviewed" ? "#1e40af" : "transparent" }}>
              <Text style={{ fontWeight: "700", color: filter === "reviewed" ? "#1e40af" : "#9ca3af", fontSize: 13 }}>HISTORY</Text>
            </Pressable>
         </View>
         <View className="bg-blue-100 px-2 py-0.5 rounded-md">
            <Text style={{ fontSize: 10, color: "#1e40af", fontWeight: "800" }}>{filteredSessions.length} RECORDS</Text>
         </View>
      </View>

      <ScrollView className="flex-1 bg-gray-50" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {sessionsQuery.isLoading ? (
            <Text style={{ color: "#4b5563", textAlign: "center", marginVertical: 20 }}>Scanning ledger records...</Text>
          ) : null}

          {!sessionsQuery.isLoading && filteredSessions.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 items-center justify-center opacity-40">
              <Icon source="check-decagram-outline" size={64} color="#9ca3af" />
              <Text variant="titleMedium" style={{ fontWeight: "800", color: "#111827", marginTop: 16 }}>Clear Ledger</Text>
              <Text variant="bodySmall" style={{ color: "#6b7280", marginTop: 4, textAlign: "center" }}>
                All shop closures have been processed.
              </Text>
            </View>
          ) : null}

          <View className="gap-4">
            {filteredSessions.map((session) => {
              const diff = Number(session.difference || 0);
              const isMismatched = Math.abs(diff) > 0.01;

              return (
                <Card
                  key={session.id}
                  style={{
                    backgroundColor: "white",
                    borderRadius: 16,
                    overflow: 'hidden',
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.05,
                    shadowRadius: 10,
                    elevation: 3,
                  }}
                >
                  <View className="bg-gray-900 px-4 py-3 flex-row justify-between items-center">
                    <View className="flex-row items-center gap-2">
                       <Icon source="account-tie-outline" size={18} color="white" />
                       <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>OPERATOR: {session.staff?.name.toUpperCase()}</Text>
                    </View>
                    <StatusPill label={session.status} tone={session.status === "REVIEWED" ? "green" : "amber"} />
                  </View>

                  <Card.Content style={{ padding: 20, gap: 16 }}>
                    <View className="flex-row gap-4">
                      <View className="flex-1">
                        <Text variant="labelSmall" style={{ color: "#64748b", fontWeight: "700" }}>EXPECTED LEDGER</Text>
                        <Text variant="headlineSmall" style={{ fontWeight: "900", color: "#111827" }}>₹{session.expectedCash.toLocaleString()}</Text>
                      </View>
                      <View className="flex-1 items-end">
                        <Text variant="labelSmall" style={{ color: "#64748b", fontWeight: "700" }}>PHYSICAL COUNT</Text>
                        <Text variant="headlineSmall" style={{ fontWeight: "900", color: isMismatched ? "#ef4444" : "#10b981" }}>₹{(session.actualCash || 0).toLocaleString()}</Text>
                      </View>
                    </View>

                    <View className="bg-gray-50 rounded-xl p-4 gap-3 border border-gray-100">
                      <DetailRow label="Handover Amount" value={`₹${(session.cashHandover || 0).toLocaleString()}`} />
                      
                      {Number(session.otherDeductionsAmount || 0) > 0 && (
                        <View className="pt-2 border-t border-gray-200/50">
                           <DetailRow label="Expenses/Deductions" value={`-₹${session.otherDeductionsAmount}`} isAlert />
                           <Text style={{ fontSize: 11, color: "#64748b", fontStyle: "italic", marginTop: 2 }}>"{session.otherDeductionsReason}"</Text>
                        </View>
                      )}

                      {isMismatched ? (
                        <View className="pt-2 border-t border-red-100">
                           <DetailRow label="Reconciliation Gap" value={`${diff > 0 ? "+" : ""}₹${diff.toFixed(2)}`} isAlert />
                           <Text style={{ fontSize: 11, color: "#b91c1c", fontWeight: "600", marginTop: 2 }}>Remark: {session.differenceReason || "No explanation provided"}</Text>
                        </View>
                      ) : (
                        <View className="pt-2 border-t border-emerald-100 flex-row justify-between">
                           <Text style={{ fontSize: 12, color: "#059669", fontWeight: "700" }}>Status</Text>
                           <Text style={{ fontSize: 12, color: "#059669", fontWeight: "800" }}>MATCHED</Text>
                        </View>
                      )}
                    </View>

                    <View className="flex-row justify-between items-center pt-2">
                       <View>
                          <Text style={{ fontSize: 10, color: "#94a3b8", fontWeight: "600" }}>SHIFT DURATION</Text>
                          <Text style={{ fontSize: 11, color: "#475569", fontWeight: "700" }}>
                            {new Date(session.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {session.closedAt ? new Date(session.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ongoing'}
                          </Text>
                       </View>
                       {session.status === "CLOSED" && (
                         <Button
                            mode="contained"
                            buttonColor="#1e40af"
                            loading={reviewMutation.isPending && reviewMutation.variables === session.id}
                            style={{ borderRadius: 10 }}
                            labelStyle={{ fontWeight: "800", fontSize: 12 }}
                            onPress={() => reviewMutation.mutate(session.id)}
                          >
                            Approve
                          </Button>
                       )}
                    </View>
                  </Card.Content>
                </Card>
              );
            })}
          </View>
      </ScrollView>
    </Screen>
  );
}

function DetailRow({ label, value, isAlert }: { label: string, value: string, isAlert?: boolean }) {
  return (
    <View className="flex-row justify-between items-center">
      <Text style={{ color: "#64748b", fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: isAlert ? "#ef4444" : "#111827", fontSize: 13, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}
