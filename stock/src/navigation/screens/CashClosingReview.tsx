import { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, SegmentedButtons, Text, Card, Icon } from "react-native-paper";
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

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Cash Closing"
        subtitle="Review and approve day-end cash handovers."
      />

      <ShopPicker shops={shopsQuery.data ?? []} selectedShopId={shopId} onSelect={setShopId} />

      <SegmentedButtons
        value={filter}
        onValueChange={setFilter}
        buttons={[
          { value: "pending", label: "Needs Review" },
          { value: "reviewed", label: "Reviewed / Locked" },
        ]}
        style={{ marginVertical: 8 }}
        theme={{ colors: { primary: "#1e40af" } }}
      />

      <ScrollView className="flex-1 mt-2">
        <Section title={`Day closing records (${filteredSessions.length})`}>
          {sessionsQuery.isLoading ? (
            <Text style={{ color: "#4b5563", textAlign: "center", marginVertical: 20 }}>Loading sessions...</Text>
          ) : null}

          {!sessionsQuery.isLoading && filteredSessions.length === 0 ? (
            <View className="rounded-lg border border-dashed border-gray-200 bg-white p-8 items-center justify-center">
              <Text variant="titleMedium" style={{ fontWeight: "700", color: "#111827" }}>All Reviewed</Text>
              <Text variant="bodySmall" style={{ color: "#4b5563", marginTop: 4, textAlign: "center" }}>
                No cash closures require review at this time.
              </Text>
            </View>
          ) : null}

          <View className="gap-4">
            {filteredSessions.map((session) => {
              const diff = Number(session.difference || 0);
              const isMismatched = diff !== 0;

              return (
                <Card
                  key={session.id}
                  style={{
                    backgroundColor: "white",
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                    elevation: 1,
                  }}
                >
                  <Card.Content style={{ gap: 12 }}>
                    <View className="flex-row justify-between items-center">
                      <View className="flex-row items-center gap-2">
                        <Icon source="cash-register" size={20} color="#1e40af" />
                        <Text variant="titleMedium" style={{ fontWeight: "800", color: "#111827" }}>
                          Session by {session.staff?.name}
                        </Text>
                      </View>
                      <StatusPill label={session.status} tone={session.status === "REVIEWED" ? "green" : "amber"} />
                    </View>

                    <View className="flex-row gap-3 border-t border-gray-50 pt-3">
                      <View className="flex-1 bg-gray-50 p-3 rounded-lg">
                        <Text style={{ fontSize: 10, color: "#4b5563", fontWeight: "600" }}>Expected Cash</Text>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: "#111827", marginTop: 2 }}>
                          ₹{session.expectedCash}
                        </Text>
                      </View>
                      <View className="flex-1 bg-gray-50 p-3 rounded-lg">
                        <Text style={{ fontSize: 10, color: "#4b5563", fontWeight: "600" }}>Actual Cash</Text>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: "#111827", marginTop: 2 }}>
                          ₹{session.actualCash || "0"}
                        </Text>
                      </View>
                    </View>

                    <View className="gap-2 bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                      <View className="flex-row justify-between">
                        <Text style={{ fontSize: 11, color: "#4b5563" }}>Handover Amount:</Text>
                        <Text style={{ fontSize: 11, color: "#111827", fontWeight: "700" }}>₹{session.cashHandover || "0"}</Text>
                      </View>

                      {Number(session.otherDeductionsAmount || 0) > 0 ? (
                        <View className="gap-0.5 border-t border-gray-200/50 pt-1.5 mt-0.5">
                          <View className="flex-row justify-between">
                            <Text style={{ fontSize: 11, color: "#4b5563" }}>Other Deductions / Expenses:</Text>
                            <Text style={{ fontSize: 11, color: "#ef4444", fontWeight: "700" }}>-₹{session.otherDeductionsAmount}</Text>
                          </View>
                          <Text style={{ fontSize: 10, color: "#6b7280", fontStyle: "italic" }}>
                            Reason: {session.otherDeductionsReason}
                          </Text>
                        </View>
                      ) : null}

                      {isMismatched ? (
                        <View className="gap-0.5 border-t border-red-100 pt-1.5 mt-0.5">
                          <View className="flex-row justify-between">
                            <Text style={{ fontSize: 11, color: "#ef4444", fontWeight: "700" }}>Difference Mismatch:</Text>
                            <Text style={{ fontSize: 11, color: "#ef4444", fontWeight: "800" }}>
                              {diff > 0 ? "+" : ""}₹{diff}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 10, color: "#ef4444", fontStyle: "italic", fontWeight: "500" }}>
                            Explanation: {session.differenceReason || "No explanation provided"}
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row justify-between border-t border-green-100 pt-1.5 mt-0.5">
                          <Text style={{ fontSize: 11, color: "#059669", fontWeight: "700" }}>Reconciliation:</Text>
                          <Text style={{ fontSize: 11, color: "#059669", fontWeight: "800" }}>Matched</Text>
                        </View>
                      )}
                    </View>

                    <View className="gap-1 border-t border-gray-50 pt-3">
                      <Text style={{ fontSize: 10, color: "#6b7280" }}>
                        Opened: {new Date(session.openedAt).toLocaleString()}
                      </Text>
                      {session.closedAt ? (
                        <Text style={{ fontSize: 10, color: "#6b7280" }}>
                          Closed: {new Date(session.closedAt).toLocaleString()}
                        </Text>
                      ) : null}
                    </View>

                    {session.status === "CLOSED" && (
                      <Button
                        mode="contained"
                        buttonColor="#1e40af"
                        loading={reviewMutation.isPending && reviewMutation.variables === session.id}
                        disabled={reviewMutation.isPending}
                        style={{ borderRadius: 8, marginTop: 4 }}
                        contentStyle={{ height: 44 }}
                        onPress={() => reviewMutation.mutate(session.id)}
                      >
                        Approve & Mark Reviewed
                      </Button>
                    )}
                  </Card.Content>
                </Card>
              );
            })}
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}
