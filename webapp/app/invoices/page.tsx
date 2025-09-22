"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Search, Filter, Download, Send, Eye, MoreHorizontal, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface Invoice {
  id: string
  number: string
  clientName: string
  clientEmail: string
  amount: number
  status: "draft" | "sent" | "paid" | "overdue"
  issueDate: string
  dueDate: string
  paidDate?: string
}

const mockInvoices: Invoice[] = [
  {
    id: "1",
    number: "INV-001",
    clientName: "Acme Corporation",
    clientEmail: "sarah@acmecorp.com",
    amount: 2500,
    status: "paid",
    issueDate: "2024-01-15",
    dueDate: "2024-02-15",
    paidDate: "2024-02-10",
  },
  {
    id: "2",
    number: "INV-002",
    clientName: "Tech Startup Inc",
    clientEmail: "m.chen@techstartup.io",
    amount: 1800,
    status: "sent",
    issueDate: "2024-01-20",
    dueDate: "2024-02-20",
  },
  {
    id: "3",
    number: "INV-003",
    clientName: "Creative Design Agency",
    clientEmail: "emma@designagency.com",
    amount: 3200,
    status: "overdue",
    issueDate: "2023-12-10",
    dueDate: "2024-01-10",
  },
  {
    id: "4",
    number: "INV-004",
    clientName: "Global Solutions Ltd",
    clientEmail: "contact@globalsolutions.com",
    amount: 4500,
    status: "draft",
    issueDate: "2024-01-25",
    dueDate: "2024-02-25",
  },
  {
    id: "5",
    number: "INV-005",
    clientName: "Innovation Labs",
    clientEmail: "billing@innovationlabs.com",
    amount: 2200,
    status: "sent",
    issueDate: "2024-01-22",
    dueDate: "2024-02-22",
  },
]

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>(mockInvoices)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.clientEmail.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: Invoice["status"]) => {
    switch (status) {
      case "paid":
        return "bg-green-900 text-green-300"
      case "sent":
        return "bg-blue-900 text-blue-300"
      case "overdue":
        return "bg-red-900 text-red-300"
      case "draft":
        return "bg-gray-700 text-gray-300"
      default:
        return "bg-gray-700 text-gray-300"
    }
  }

  const totalAmount = invoices.reduce((sum, invoice) => sum + invoice.amount, 0)
  const paidAmount = invoices.filter((inv) => inv.status === "paid").reduce((sum, invoice) => sum + invoice.amount, 0)
  const pendingAmount = invoices
    .filter((inv) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum, invoice) => sum + invoice.amount, 0)

  return (
    <div className="min-h-screen bg-[#1A1A1A]">

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-poppins font-bold text-white mb-2">Invoices</h1>
            <p className="text-gray-400">Track and manage all your invoices</p>
          </div>

          <Button className="bg-[#5C6EF8] hover:bg-[#4A5CE8] text-white">
            <Plus className="h-4 w-4 mr-2" />
            Create Invoice
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">${totalAmount.toLocaleString()}</div>
              <p className="text-xs text-gray-500">All time earnings</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">Paid Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">${paidAmount.toLocaleString()}</div>
              <p className="text-xs text-gray-500">
                {invoices.filter((inv) => inv.status === "paid").length} invoices paid
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">Pending Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-400">${pendingAmount.toLocaleString()}</div>
              <p className="text-xs text-gray-500">
                {invoices.filter((inv) => inv.status === "sent" || inv.status === "overdue").length} invoices pending
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-gray-900 border-gray-800 mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search invoices by number, client, or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48 bg-gray-800 border-gray-700 text-white">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="all" className="text-gray-300">
                    All Statuses
                  </SelectItem>
                  <SelectItem value="draft" className="text-gray-300">
                    Draft
                  </SelectItem>
                  <SelectItem value="sent" className="text-gray-300">
                    Sent
                  </SelectItem>
                  <SelectItem value="paid" className="text-gray-300">
                    Paid
                  </SelectItem>
                  <SelectItem value="overdue" className="text-gray-300">
                    Overdue
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Invoices Table */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Invoice List</CardTitle>
            <CardDescription className="text-gray-400">
              {filteredInvoices.length} of {invoices.length} invoices
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left p-4 text-gray-400 font-medium">Invoice</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Client</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Amount</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Status</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Issue Date</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Due Date</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="p-4">
                        <div className="font-medium text-white">{invoice.number}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-white">{invoice.clientName}</div>
                        <div className="text-sm text-gray-400">{invoice.clientEmail}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-white">${invoice.amount.toLocaleString()}</div>
                      </td>
                      <td className="p-4">
                        <Badge className={cn("capitalize", getStatusColor(invoice.status))}>{invoice.status}</Badge>
                      </td>
                      <td className="p-4">
                        <div className="text-gray-300">{new Date(invoice.issueDate).toLocaleDateString()}</div>
                      </td>
                      <td className="p-4">
                        <div className={cn("text-gray-300", invoice.status === "overdue" && "text-red-400")}>
                          {new Date(invoice.dueDate).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end space-x-2">
                          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                            <Download className="h-4 w-4" />
                          </Button>
                          {invoice.status !== "paid" && (
                            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-gray-800 border-gray-700">
                              <DropdownMenuItem className="text-gray-300 hover:bg-gray-700">
                                Edit Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-gray-300 hover:bg-gray-700">Duplicate</DropdownMenuItem>
                              <DropdownMenuItem className="text-red-400 hover:bg-gray-700">Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {filteredInvoices.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">No invoices found matching your criteria.</div>
            <Button
              onClick={() => {
                setSearchTerm("")
                setStatusFilter("all")
              }}
              variant="outline"
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              Clear Filters
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
